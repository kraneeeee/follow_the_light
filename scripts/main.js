import { fade } from "./fade.js";
import { initGameAudio } from "./gameAudio.js";
import { initUiMenus } from "./uiMenus.js";

runOnStartup(runtime => {
	fade(runtime);
	initGameAudio(runtime);
	initUiMenus(runtime);
});
