// The one module in the home page's client graph that imports GSAP. Nothing imports it statically:
// `load-gsap.ts` fetches it once the browser is idle after hydration, so GSAP and ScrollTrigger
// stay out of the chunks the served HTML loads. Everything else refers to GSAP through the runtime
// that loader hands out, or with `import type`.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };
