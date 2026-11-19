
export function fade(runtime) {
    globalThis.fading = false;
    globalThis.fadeOut = false;
    globalThis.fadeTimer = 0;

    const speedToFade = 0.8;
    const speedToFadeOut = 0.2;

    runtime.addEventListener("tick", () => {
        if (globalThis.fading) {
            const blackScreen = runtime.objects.black_screen.getFirstInstance();

            blackScreen.opacity += speedToFade * runtime.dt;

            if (blackScreen.opacity >= 1) {
                blackScreen.opacity = 1;
                globalThis.fading = false;

                runtime.goToLayout("Game");
            }
        }

        if (globalThis.fadeOut) {
            globalThis.fadeTimer += runtime.dt;

            if (globalThis.fadeTimer >= 2) {
                const blackScreen = runtime.objects.black_screen.getFirstInstance();

                blackScreen.opacity -= speedToFadeOut * runtime.dt

                if (blackScreen.opacity <= 0) {
                    globalThis.fadeOut = false;
                }
            }
        }
    });
}
