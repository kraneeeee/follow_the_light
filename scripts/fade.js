globalThis.isPlayerDead = false;
globalThis.playerRespawned = false;

export function fade(runtime) {
    globalThis.fading = false;
    globalThis.fadeOut = false;
    globalThis.fadeTimer = 0;

    runtime.addEventListener("tick", () => {
        if (globalThis.fading) {
            toFade(runtime, 0.8, true)
        }

        if (globalThis.fadeOut) {
            let blackscreen = toUnfade(runtime, 0.2)
            if (blackscreen.opacity <= 0) globalThis.fadeOut = false;  
        }

        if (globalThis.isPlayerDead) {
            toFade(runtime, 1, false)
        }

        if (globalThis.playerRespawned) {
            let blackscreen = toUnfade(runtime, 0.7)
            if (blackscreen.opacity <= 0) globalThis.playerRespawned = false;  
        }
    });
}

function toFade(runtime, speedToFade, goToGameLayout) {
    const blackScreen = runtime.objects.black_screen.getFirstInstance();

    blackScreen.opacity += speedToFade * runtime.dt;

    if (blackScreen.opacity >= 1) {
        blackScreen.opacity = 1;
        globalThis.fading = false;

        if (goToGameLayout) runtime.goToLayout("Game");
    }
};

function toUnfade(runtime, speedToFadeOut) { 
    globalThis.fadeTimer += runtime.dt;

    if (globalThis.fadeTimer >= 2) {
        const blackScreen = runtime.objects.black_screen.getFirstInstance();

        blackScreen.opacity -= speedToFadeOut * runtime.dt
        return blackScreen;
    }
}
