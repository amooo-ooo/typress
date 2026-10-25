import { createRouter } from "../scripts/router/index";

/**
 * Initialises and mounts the client-side SPA router.
 */
const router = createRouter({ container: "#app" });
router.mount();
