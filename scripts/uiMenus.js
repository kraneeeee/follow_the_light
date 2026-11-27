import {
	getMusicVolumePercent,
	getSfxVolumePercent,
	setMusicVolumePercent,
	setSfxVolumePercent,
	playUiClick,
	playUiHover,
	fadeOutAmbience,
	fadeOutBgm
} from "./gameAudio.js";

let runtime = null;
let root = null;
let pausePanel = null;
let settingsPanel = null;
let musicSlider = null;
let sfxSlider = null;
let musicValueEl = null;
let sfxValueEl = null;

let mode = "none"; 
let settingsReturnTo = "menu";
let escDown = false;
let savedPlatformEnabled = true;
let savedDogBullet = [];

function ensureStyles() {
	if (document.getElementById("ftl-ui-styles")) return;
	const style = document.createElement("style");
	style.id = "ftl-ui-styles";
	style.textContent = `
		#ftl-ui-root {
			position: fixed;
			inset: 0;
			z-index: 99999;
			pointer-events: none;
			display: flex;
			align-items: center;
			justify-content: center;
			font-family: "Bebas Neue Pro Book", "Bebas Neue", "Arial Narrow", Impact, sans-serif;
			letter-spacing: 0.04em;
			user-select: none;
		}
		#ftl-ui-root.ftl-open {
			pointer-events: auto;
			background: rgba(4, 8, 10, 0.55);
		}
		.ftl-panel {
			display: none;
			flex-direction: column;
			align-items: stretch;
			gap: 18px;
			min-width: min(420px, 86vw);
			padding: 36px 40px 32px;
			background: linear-gradient(180deg, rgba(18, 28, 26, 0.96), rgba(8, 12, 12, 0.98));
			border: 1px solid rgba(180, 210, 190, 0.18);
			box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
			color: #f2f5f2;
		}
		.ftl-panel.ftl-visible {
			display: flex;
		}
		.ftl-title {
			margin: 0 0 8px;
			text-align: center;
			font-size: 42px;
			font-weight: 400;
			color: #f7faf7;
		}
		.ftl-btn {
			appearance: none;
			border: none;
			background: transparent;
			color: #f2f5f2;
			font: inherit;
			font-size: 34px;
			padding: 10px 8px;
			cursor: pointer;
			opacity: 0.85;
			transition: opacity 0.12s ease, color 0.12s ease;
			text-align: center;
		}
		.ftl-btn:hover,
		.ftl-btn:focus-visible {
			opacity: 1;
			color: #ffffff;
			outline: none;
		}
		.ftl-btn:active {
			opacity: 0.7;
		}
		.ftl-row {
			display: flex;
			flex-direction: column;
			gap: 8px;
			margin: 4px 0;
		}
		.ftl-label-row {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			font-size: 22px;
			opacity: 0.92;
		}
		.ftl-slider {
			-webkit-appearance: none;
			appearance: none;
			width: 100%;
			height: 8px;
			border-radius: 0;
			background: rgba(255, 255, 255, 0.18);
			outline: none;
			cursor: pointer;
		}
		.ftl-slider::-webkit-slider-thumb {
			-webkit-appearance: none;
			appearance: none;
			width: 18px;
			height: 18px;
			background: #e8eee8;
			border: 1px solid rgba(0, 0, 0, 0.35);
			cursor: pointer;
		}
		.ftl-slider::-moz-range-thumb {
			width: 18px;
			height: 18px;
			background: #e8eee8;
			border: 1px solid rgba(0, 0, 0, 0.35);
			cursor: pointer;
		}
	`;
	document.head.appendChild(style);
}

function buildUi() {
	if (root) return;
	ensureStyles();

	root = document.createElement("div");
	root.id = "ftl-ui-root";
	root.innerHTML = `
		<div class="ftl-panel" id="ftl-pause-panel" aria-hidden="true">
			<h2 class="ftl-title">Пауза</h2>
			<button type="button" class="ftl-btn" data-action="continue">Продолжить</button>
			<button type="button" class="ftl-btn" data-action="settings">Настройки</button>
			<button type="button" class="ftl-btn" data-action="exit-menu">В главное меню</button>
		</div>
		<div class="ftl-panel" id="ftl-settings-panel" aria-hidden="true">
			<h2 class="ftl-title">Настройки</h2>
			<div class="ftl-row">
				<div class="ftl-label-row">
					<span>Громкость музыки</span>
					<span id="ftl-music-value">100%</span>
				</div>
				<input id="ftl-music-slider" class="ftl-slider" type="range" min="0" max="100" step="1" value="100" />
			</div>
			<div class="ftl-row">
				<div class="ftl-label-row">
					<span>Громкость эффектов</span>
					<span id="ftl-sfx-value">100%</span>
				</div>
				<input id="ftl-sfx-slider" class="ftl-slider" type="range" min="0" max="100" step="1" value="100" />
			</div>
			<button type="button" class="ftl-btn" data-action="settings-back">Назад</button>
		</div>
	`;
	document.body.appendChild(root);

	pausePanel = root.querySelector("#ftl-pause-panel");
	settingsPanel = root.querySelector("#ftl-settings-panel");
	musicSlider = root.querySelector("#ftl-music-slider");
	sfxSlider = root.querySelector("#ftl-sfx-slider");
	musicValueEl = root.querySelector("#ftl-music-value");
	sfxValueEl = root.querySelector("#ftl-sfx-value");

	root.addEventListener("pointerdown", (e) => e.stopPropagation());
	root.addEventListener("pointerup", (e) => e.stopPropagation());
	root.addEventListener("click", (e) => e.stopPropagation());

	root.querySelectorAll(".ftl-btn").forEach((btn) => {
		btn.addEventListener("mouseenter", () => playUiHover());
		btn.addEventListener("click", () => {
			playUiClick();
			onAction(btn.getAttribute("data-action"));
		});
	});

	musicSlider.addEventListener("input", () => {
		const v = Number(musicSlider.value);
		musicValueEl.textContent = v + "%";
		setMusicVolumePercent(v);
	});
	sfxSlider.addEventListener("input", () => {
		const v = Number(sfxSlider.value);
		sfxValueEl.textContent = v + "%";
		setSfxVolumePercent(v);
	});
}

function syncSliders() {
	const m = getMusicVolumePercent();
	const s = getSfxVolumePercent();
	musicSlider.value = String(m);
	sfxSlider.value = String(s);
	musicValueEl.textContent = m + "%";
	sfxValueEl.textContent = s + "%";
}

function setMenuButtonsVisible(visible) {
	const family = runtime.objects.MenuButtons;
	if (!family) return;
	for (const inst of family.getAllInstances()) {
		inst.isVisible = visible;
	}
}

function setGameplayPaused(paused) {
	globalThis.isGamePaused = !!paused;

	const playerObj = runtime.objects.player;
	const player = playerObj ? playerObj.getFirstInstance() : null;
	if (player && player.behaviors && player.behaviors.Platform) {
		if (paused) {
			savedPlatformEnabled = player.behaviors.Platform.isEnabled !== false;
			player.behaviors.Platform.isEnabled = false;
		} else {
			player.behaviors.Platform.isEnabled = savedPlatformEnabled;
		}
	}

	const dogObj = runtime.objects.dog;
	if (dogObj) {
		if (paused) {
			savedDogBullet = [];
			for (const dog of dogObj.getAllInstances()) {
				const bullet = dog.behaviors && dog.behaviors.Bullet;
				if (!bullet) continue;
				savedDogBullet.push({ uid: dog.uid, enabled: bullet.isEnabled !== false });
				bullet.isEnabled = false;
			}
		} else {
			for (const dog of dogObj.getAllInstances()) {
				const bullet = dog.behaviors && dog.behaviors.Bullet;
				if (!bullet) continue;
				const saved = savedDogBullet.find((s) => s.uid === dog.uid);
				bullet.isEnabled = saved ? saved.enabled : true;
			}
			savedDogBullet = [];
		}
	}

	try {
		runtime.timeScale = paused ? 0 : 1;
	} catch (e) {
		console.warn("[uiMenus] timeScale failed", e);
	}
}

function showPanels() {
	buildUi();
	const open = mode !== "none";
	root.classList.toggle("ftl-open", open);
	pausePanel.classList.toggle("ftl-visible", mode === "pause");
	settingsPanel.classList.toggle("ftl-visible", mode === "settings");
	pausePanel.setAttribute("aria-hidden", mode === "pause" ? "false" : "true");
	settingsPanel.setAttribute("aria-hidden", mode === "settings" ? "false" : "true");
	globalThis.ftlUiBlocksMenu = open && runtime.layout && runtime.layout.name === "MainMenu";
}

function openPause() {
	if (!runtime.layout || runtime.layout.name !== "Game") return;
	if (globalThis.fading || globalThis.isPlayerDead) return;
	mode = "pause";
	setGameplayPaused(true);
	showPanels();
}

function closePauseResume() {
	mode = "none";
	showPanels();
	setGameplayPaused(false);
}

function openSettings(from) {
	settingsReturnTo = from === "pause" ? "pause" : "menu";
	mode = "settings";
	if (settingsReturnTo === "menu") {
		setMenuButtonsVisible(false);
	}
	syncSliders();
	showPanels();
}

function closeSettings() {
	if (settingsReturnTo === "pause") {
		mode = "pause";
		showPanels();
		return;
	}
	mode = "none";
	showPanels();
	setMenuButtonsVisible(true);
}

function exitToMainMenu() {
	mode = "none";
	showPanels();
	setGameplayPaused(false);
	fadeOutAmbience(0.6);
	fadeOutBgm(0.8);
	globalThis.fadeTargetLayout = "MainMenu";
	globalThis.fading = true;
}

function onAction(action) {
	if (action === "continue") {
		closePauseResume();
	} else if (action === "settings") {
		openSettings("pause");
	} else if (action === "exit-menu") {
		exitToMainMenu();
	} else if (action === "settings-back") {
		closeSettings();
	}
}

function onEscape() {
	const layout = runtime.layout ? runtime.layout.name : "";
	if (layout === "Game") {
		if (mode === "settings" && settingsReturnTo === "pause") {
			playUiClick();
			closeSettings();
			return;
		}
		if (mode === "pause") {
			playUiClick();
			closePauseResume();
			return;
		}
		if (mode === "none") {
			playUiClick();
			openPause();
		}
		return;
	}
	if (layout === "MainMenu") {
		if (mode === "settings") {
			playUiClick();
			closeSettings();
		}
	}
}

function onKeyDown(e) {
	if (e.code !== "Escape" && e.key !== "Escape") return;
	if (escDown) return;
	escDown = true;
	onEscape();
}

function onKeyUp(e) {
	if (e.code === "Escape" || e.key === "Escape") escDown = false;
}

function onLayoutStart() {
	mode = "none";
	globalThis.ftlUiBlocksMenu = false;
	if (root) showPanels();
	if (runtime.layout && runtime.layout.name === "Game") {
		setGameplayPaused(false);
	}
	if (runtime.layout && runtime.layout.name === "MainMenu") {
		setMenuButtonsVisible(true);
	}
}

export function initUiMenus(rt) {
	runtime = rt;
	globalThis.isGamePaused = false;
	globalThis.ftlUiBlocksMenu = false;
	globalThis.ftlOpenSettings = (from) => openSettings(from || "menu");

	buildUi();
	syncSliders();
	showPanels();

	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("keyup", onKeyUp);

	runtime.addEventListener("afteranylayoutstart", () => {
		onLayoutStart();
	});
}
