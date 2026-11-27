const VOL = {
	bgm: 0.25,
	ambience: 0.08,
	footstep: 0.3,
	footstepRun: 0.36,
	jump: 0.32,
	land: 0.3,
	ui: 0.2
};

const STORAGE_KEY = "ftl_audio_settings_v1";

const FOOTSTEPS = [
	"footstep_00.webm",
	"footstep_01.webm",
	"footstep_02.webm",
	"footstep_03.webm",
	"footstep_04.webm"
];

let runtime = null;
let audioCtx = null;
let masterGain = null;
const buffers = new Map();

let bgmEl = null;
let ambienceEl = null;
let currentBgmName = null;
let pendingBgm = null;
let pendingAmbience = null;

let musicMul = 1;
let sfxMul = 1;

let footstepTimer = 0;
let wasOnFloor = true;
let hoverInst = null;
let prevFading = false;
let leftDown = false;
let unlocked = false;

function clamp01(v) {
	return Math.max(0, Math.min(1, v));
}

function loadSavedVolumes() {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const data = JSON.parse(raw);
		if (typeof data.music === "number") musicMul = clamp01(data.music);
		if (typeof data.sfx === "number") sfxMul = clamp01(data.sfx);
	} catch (e) {
		console.warn("[gameAudio] could not load volume settings", e);
	}
}

function saveVolumes() {
	try {
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ music: musicMul, sfx: sfxMul })
		);
	} catch (e) {
		console.warn("[gameAudio] could not save volume settings", e);
	}
}

function musicVolumeFor(base) {
	return clamp01(base * musicMul);
}

function sfxVolumeFor(base) {
	return clamp01(base * sfxMul);
}

function applyMusicVolumesNow() {
	if (bgmEl) {
		if (bgmEl._entry && bgmEl._entry.gain) {
			bgmEl._entry.gain.gain.value = musicVolumeFor(VOL.bgm);
			bgmEl.volume = musicVolumeFor(VOL.bgm);
		} else {
			bgmEl.volume = musicVolumeFor(VOL.bgm);
		}
	}
	if (ambienceEl) {
		if (ambienceEl._entry && ambienceEl._entry.gain) {
			ambienceEl._entry.gain.gain.value = musicVolumeFor(VOL.ambience);
			ambienceEl.volume = musicVolumeFor(VOL.ambience);
		} else {
			ambienceEl.volume = musicVolumeFor(VOL.ambience);
		}
	}
	if (pendingBgm) pendingBgm.volume = musicVolumeFor(VOL.bgm);
	if (pendingAmbience) pendingAmbience.volume = musicVolumeFor(VOL.ambience);
}

export function getMusicVolumePercent() {
	return Math.round(musicMul * 100);
}

export function getSfxVolumePercent() {
	return Math.round(sfxMul * 100);
}

export function setMusicVolumePercent(percent) {
	musicMul = clamp01(Number(percent) / 100);
	applyMusicVolumesNow();
	saveVolumes();
}

export function setSfxVolumePercent(percent) {
	sfxMul = clamp01(Number(percent) / 100);
	saveVolumes();
}

export function playUiClick() {
	playSfx("ui_click.webm", VOL.ui);
}

export function playUiHover() {
	playSfx("ui_hover.webm", VOL.ui);
}

function ensureContext() {
	if (!audioCtx) {
		const Ctx = window.AudioContext || window.webkitAudioContext;
		audioCtx = new Ctx();
		masterGain = audioCtx.createGain();
		masterGain.gain.value = 1;
		masterGain.connect(audioCtx.destination);
	}
	return audioCtx;
}

async function unlockAudio() {
	ensureContext();
	if (audioCtx.state === "suspended") {
		try {
			await audioCtx.resume();
		} catch (e) {
			console.warn("[gameAudio] resume failed", e);
			return false;
		}
	}
	const ok = audioCtx.state === "running";
	if (ok && !unlocked) {
		unlocked = true;
		await startPendingMusic();
	}
	return ok;
}

function mediaPath(fileName) {
	const folder = (runtime.assets && runtime.assets.mediaFolder) || "";
	return folder + fileName;
}

async function resolveMediaUrl(fileName) {
	const path = mediaPath(fileName);
	const assets = runtime.assets;

	if (assets && typeof assets.getMediaFileUrl === "function") {
		try {
			const result = assets.getMediaFileUrl(fileName);
			const url = result && typeof result.then === "function" ? await result : result;
			if (url) return url;
		} catch (e) {
			console.warn("[gameAudio] getMediaFileUrl failed, fallback", e);
		}
	}

	if (assets && typeof assets.getProjectFileUrl === "function") {
		try {
			const result = assets.getProjectFileUrl(path);
			const url = result && typeof result.then === "function" ? await result : result;
			if (url) return url;
		} catch (e) {
			console.warn("[gameAudio] getProjectFileUrl failed, fallback", e);
		}
	}

	return path;
}

async function fetchMediaArrayBuffer(fileName) {
	const path = mediaPath(fileName);
	const assets = runtime.assets;

	if (assets && typeof assets.fetchArrayBuffer === "function") {
		try {
			return await assets.fetchArrayBuffer(path);
		} catch (e) {
			console.warn("[gameAudio] assets.fetchArrayBuffer failed, trying fetch()", e);
		}
	}

	const url = await resolveMediaUrl(fileName);
	const response = await fetch(url);
	if (!response.ok) throw new Error("HTTP " + response.status + " for " + fileName);
	return await response.arrayBuffer();
}

function decodeAudioDataNative(arrayBuffer) {
	ensureContext();
	return new Promise((resolve, reject) => {
		const copy = arrayBuffer.slice(0);
		const ret = audioCtx.decodeAudioData(copy, resolve, reject);
		if (ret && typeof ret.then === "function") {
			ret.then(resolve, reject);
		}
	});
}

async function loadBuffer(fileName) {
	if (buffers.has(fileName)) return buffers.get(fileName);
	const arrayBuffer = await fetchMediaArrayBuffer(fileName);
	const buffer = await decodeAudioDataNative(arrayBuffer);
	buffers.set(fileName, buffer);
	return buffer;
}

function stopHtmlAudio(el) {
	if (!el) return;
	try {
		el.pause();
		el.removeAttribute("src");
		el.load();
	} catch (e) {
		/* ignore */
	}
}

async function playHtmlLoop(fileName, volume) {
	const url = await resolveMediaUrl(fileName);
	const el = new Audio();
	el.loop = true;
	el.volume = clamp01(volume);
	el.src = url;
	el.preload = "auto";
	await el.play();
	return el;
}

function fadeHtmlAudio(el, seconds, onDone) {
	if (!el) {
		if (onDone) onDone();
		return;
	}
	const startVol = el.volume;
	const steps = Math.max(1, Math.floor(seconds * 20));
	let i = 0;
	const id = setInterval(() => {
		i += 1;
		el.volume = Math.max(0, startVol * (1 - i / steps));
		if (i >= steps) {
			clearInterval(id);
			stopHtmlAudio(el);
			if (onDone) onDone();
		}
	}, (seconds * 1000) / steps);
}

function startBuffer(buffer, volume, loop) {
	ensureContext();
	const source = audioCtx.createBufferSource();
	const gain = audioCtx.createGain();
	source.buffer = buffer;
	source.loop = !!loop;
	gain.gain.value = volume;
	source.connect(gain);
	gain.connect(masterGain);
	source.start(0);
	return { source, gain };
}

async function playSfx(fileName, volume) {
	if (!(await unlockAudio())) return;
	try {
		const buffer = await loadBuffer(fileName);
		startBuffer(buffer, sfxVolumeFor(volume), false);
	} catch (e) {
		console.warn("[gameAudio] sfx failed:", fileName, e);
	}
}

async function playLoop(fileName, volume, slot) {
	if (!unlocked) {
		if (slot === "bgm") pendingBgm = { fileName, volume };
		else pendingAmbience = { fileName, volume };
		return;
	}

	try {
		const el = await playHtmlLoop(fileName, volume);
		if (slot === "bgm") {
			stopHtmlAudio(bgmEl);
			bgmEl = el;
			currentBgmName = fileName;
			pendingBgm = null;
		} else {
			stopHtmlAudio(ambienceEl);
			ambienceEl = el;
			pendingAmbience = null;
		}
	} catch (htmlErr) {
		console.warn("[gameAudio] HTMLAudio loop failed, trying WebAudio:", fileName, htmlErr);
		try {
			const buffer = await loadBuffer(fileName);
			const entry = startBuffer(buffer, volume, true);
			if (slot === "bgm") {
				stopHtmlAudio(bgmEl);
				bgmEl = {
					pause() {
						try {
							entry.source.stop();
						} catch (e) {
							/* ignore */
						}
					},
					volume: volume,
					_entry: entry
				};
				currentBgmName = fileName;
				pendingBgm = null;
			} else {
				stopHtmlAudio(ambienceEl);
				ambienceEl = {
					pause() {
						try {
							entry.source.stop();
						} catch (e) {
							/* ignore */
						}
					},
					volume: volume,
					_entry: entry
				};
				pendingAmbience = null;
			}
		} catch (e) {
			console.warn("[gameAudio] loop failed:", fileName, e);
		}
	}
}

async function startPendingMusic() {
	if (pendingBgm) {
		const p = pendingBgm;
		pendingBgm = null;
		await playLoop(p.fileName, p.volume, "bgm");
	}
	if (pendingAmbience) {
		const p = pendingAmbience;
		pendingAmbience = null;
		await playLoop(p.fileName, p.volume, "ambience");
	}
}

function fadeOutSlot(slot, seconds) {
	if (slot === "bgm") {
		pendingBgm = null;
		const el = bgmEl;
		bgmEl = null;
		currentBgmName = null;
		if (el && el._entry) {
			stopHtmlAudio(el);
		} else {
			fadeHtmlAudio(el, seconds);
		}
	} else {
		pendingAmbience = null;
		const el = ambienceEl;
		ambienceEl = null;
		if (el && el._entry) {
			stopHtmlAudio(el);
		} else {
			fadeHtmlAudio(el, seconds);
		}
	}
}

export function fadeOutAmbience(seconds) {
	fadeOutSlot("ambience", seconds || 0.5);
}

export function fadeOutBgm(seconds) {
	fadeOutSlot("bgm", seconds || 0.8);
}

function buttonUnderCursor() {
	const mouse = runtime.objects.Mouse;
	const family = runtime.objects.MenuButtons;
	if (!mouse || !family) return null;
	const x = mouse.getMouseX();
	const y = mouse.getMouseY();
	for (const inst of family.getAllInstances()) {
		if (!inst.isVisible) continue;
		if (inst.containsPoint(x, y)) return inst;
	}
	return null;
}

async function onLayoutStart() {
	const name = runtime.layout ? runtime.layout.name : "";
	footstepTimer = 0;
	wasOnFloor = true;
	hoverInst = null;
	leftDown = false;

	console.log("[gameAudio] layout:", name, "unlocked=", unlocked);

	if (name === "MainMenu") {
		stopHtmlAudio(ambienceEl);
		ambienceEl = null;
		pendingAmbience = null;
		if (currentBgmName !== "music_menu.webm") {
			await playLoop("music_menu.webm", musicVolumeFor(VOL.bgm), "bgm");
		} else {
			applyMusicVolumesNow();
		}
	} else if (name === "Game") {
		if (currentBgmName !== "music_forest.webm") {
			await playLoop("music_forest.webm", musicVolumeFor(VOL.bgm), "bgm");
		} else {
			applyMusicVolumesNow();
		}
		await playLoop("ambience_forest.webm", musicVolumeFor(VOL.ambience), "ambience");
	}
}

function updateMenu() {
	if (globalThis.ftlUiBlocksMenu) {
		hoverInst = null;
		leftDown = !!window.__ftlMouseDown;
		return;
	}

	const over = buttonUnderCursor();
	if (over && over !== hoverInst) {
		playSfx("ui_hover.webm", VOL.ui);
	}
	hoverInst = over;

	const down = !!window.__ftlMouseDown;
	const pressed = down && !leftDown;
	leftDown = down;
	if (!pressed || !hoverInst) return;

	playSfx("ui_click.webm", VOL.ui);
	const typeName = hoverInst.objectType ? hoverInst.objectType.name : "";
	if (typeName === "play") {
		globalThis.fadeTargetLayout = "Game";
		fadeOutSlot("bgm", 0.8);
	} else if (typeName === "settings") {
		if (typeof globalThis.ftlOpenSettings === "function") {
			globalThis.ftlOpenSettings("menu");
		}
	}
}

function updatePlayer() {
	if (globalThis.isGamePaused) return;

	const playerObj = runtime.objects.player;
	if (!playerObj) return;
	const player = playerObj.getFirstInstance();
	if (!player || !player.behaviors || !player.behaviors.Platform) return;

	const platform = player.behaviors.Platform;
	const onFloor = !!platform.isOnFloor;
	const moving = !!platform.isMoving;
	const dead = !!globalThis.isPlayerDead;

	let shiftDown = false;
	const kb = runtime.objects.Keyboard;
	if (kb) {
		try {
			shiftDown = kb.isKeyDown("Shift");
		} catch (e) {
			shiftDown = false;
		}
	}

	if (!onFloor && wasOnFloor && !dead) {
		playSfx("jump.webm", VOL.jump);
		footstepTimer = 0;
	}
	if (onFloor && !wasOnFloor && !dead) {
		playSfx("land.webm", VOL.land);
		footstepTimer = 0;
	}

	if (!dead && onFloor && moving) {
		const interval = shiftDown ? 0.28 : 0.45;
		footstepTimer += runtime.dt;
		if (footstepTimer >= interval) {
			footstepTimer = 0;
			const file = FOOTSTEPS[(Math.random() * FOOTSTEPS.length) | 0];
			playSfx(file, shiftDown ? VOL.footstepRun : VOL.footstep);
		}
	} else {
		footstepTimer = 0;
	}

	wasOnFloor = onFloor;
}

function onTick() {
	if (!runtime || !runtime.layout) return;
	const name = runtime.layout.name;

	if (globalThis.fading && !prevFading && name === "MainMenu") {
		fadeOutSlot("bgm", 0.8);
		playSfx("ui_click.webm", VOL.ui);
	}
	prevFading = !!globalThis.fading;

	if (name === "MainMenu") updateMenu();
	else if (name === "Game") updatePlayer();
}

function bindDomInput() {
	window.__ftlMouseDown = false;
	window.addEventListener("pointerdown", () => {
		window.__ftlMouseDown = true;
		unlockAudio();
	}, { passive: true });
	window.addEventListener("pointerup", () => {
		window.__ftlMouseDown = false;
	}, { passive: true });
	window.addEventListener("keydown", () => {
		unlockAudio();
	}, { passive: true });
}

export function initGameAudio(rt) {
	runtime = rt;
	loadSavedVolumes();
	bindDomInput();
	runtime.addEventListener("afteranylayoutstart", () => {
		onLayoutStart();
	});
	runtime.addEventListener("tick", onTick);
	console.log("[gameAudio] ready, mediaFolder=", JSON.stringify((runtime.assets && runtime.assets.mediaFolder) || ""));
}
