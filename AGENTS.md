## 1. Overview

Distillery is a desktop application for local AI image generation and media management, built on top of [condenser.cpp](https://github.com/jcluts/condenser.cpp). It targets creative professionals -- creative directors, graphic designers, product owners, production artists -- who need generative AI tools but are underserved by existing web-based offerings.

**Core ethos:** "It just works." Media-forward, not tech-forward. The library is the product; generation is one way media enters it.

**MVP scope:** Local image generation via FLUX.2 Klein, a performant media library with culling and browsing workflows, generation timeline/history, and import support. The architecture anticipates future features (video, API providers, non-destructive editing, upscaling, collections) without implementing them.

**Context:** This is a ground-up rewrite of an existing prototype (simple-ai-client). The V1 validated the UI/UX patterns and architecture but suffers from accumulated tech debt (vanilla JS origins, no CSS framework, 328 files of organically grown code). This rewrite ports the proven design decisions onto a clean foundation with shadcn/ui for consistent component styling.

## 2. Agent Notes

### Layout, Components and CSS
- Religiously use shadcn/ui for any UI elements where they have a suitable component. 
- Use Tailwind for all other CSS.
- Custom css classes should be a last resort when I UI element cannot otherwise be realized.

### UI/UX Aesthetic
- Professional, clean, and elegant at all times.

## 3. Reference Project
- The Distillery V1 repo can be found at C:\Users\jason\simple-ai-client.
- Screenshots of Distillery V1 can be found at C:\Users\jason\distillery\agent_docs\distillery_v1_screenshots.
- I am very happy with the UI/UX of the original version, so reference it for design guidance at every opportunity.
- However, never copy UI/HTML/CSS code wholesale, half the point of this project is to avoid the mistakes made with our front end code the first time around.