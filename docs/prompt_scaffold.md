# Background
- I recently completed work on an MVP of a C++ package for local image generation called compressor.cpp.
- This package is to serve as the back-end engine for image generation and upscaling for a desktop application called Distillery. This will be done via cn-engine.exe.
- My vision for Distillery: an generative AI application targeted at professionals who've traditionally been hesitant to use generative AI: creative directors, graphic designers, product owners, production artists.
- They've traditionally been reluctant to use generative AI, but are increasingly left with no option but to embrace it.
- They have terrible tools for this. Most existing tools are web based. Web based tools suck when working with 
- Ethos of condenser.cpp is simple, approachable, and straightforward image generation. "it just works". 
- However, it's just a C++ binary. The media professionals its targeted at need a UI with the same ethos.

# Task 
- Please create a spec document for the creation of a lightweight MVP for Distillery.

# Development Phases
1. Creation of full spec, including architecture, UI/UX. **What we're doing right now.**
2. Project setup, scaffolding, high level back end architecture. Putting file system and foundation in place.
3. UI/UX. Important to make sure we're going in the right direction. Non-functioning prototype. What's the general UI organization? 
4. "Wire up" generation and library functionality. User can generate an image have it appear in library.
5. Final polish work for MVP.

# Requirements

- **IMPORTANT:**: When designing architecture and UI take into account both MVP requirements and future requirements. Anticipate. Do not write specs for future requirements.

## Tech Stack
- Electron based, targeting Windows, Mac and Linux.
- Shadcn/UI for UI and components.
    - base: radix
    - style: nova
    - baseColor: neutral
    - theme: cyan
    - font: inter
    - radius: small
- TypeScript / React 19 / Tailwind 4 (or whatever latest version of shadcn supports).
- Vite / Electron Vite
- SQLite

## Terminology
- Media: the files we're creating.
    * MVP: images
    * Future: videos and other possible future media (audio, 3d, etc).
- Library: The UI and backing database for managing your media.
- Origin: How a media item entered the library.
    * MVP: generation, import.
    * Future: duplication, sketch
- Status: Media metadata affording a high level way of selecting/sorting media
    - "Selected" 
    - "Rejected"
    - None/Clear

## UI / UX
- Our UI/UX will be our differentiating feature.
- Targeted at non-technical crowd who may be doing local AI generation for first time.
- However, these people may also media professionals who expect a polished, professional look and feel for their application. 
- "Media forward" not "Tech Forward". Differentiator. The media library and media browsing is the focus, the generative AI is one way to get media into the library.
- Albeit, the gen AI aspect is what differentiates this from other similar media organization tools. 
- For our MVP, this ultimately also needs to be a showcase for condenser.cpp, carrying forward the same "it just works" mentality. 
- Make heavy usage of shadcn for components wherever possible.
- Minimize custom CSS/markup if shadcn has suitable components.

### Aesthetic
- Intuitive
- Professional
- Elegant
- Seamless
- Polished
- Dark
### Workflow
- Seamless, integrated, intuitive.
- Library items can be drag and dropped for use as image gen 

## MVP Features (with aspects postponed till future)

### Generation
#### MVP
- Generate an image with Flux 2 Klein 4b or 9b using local inference via condenser.cpp.
- Generation modes are text to image or image to image.
- UI:
    - Add an arbitrary number of input images via drag and drop from library, or file upload. Images are automatically downsized to 1 megapixel before being used for reference images. Original images of course are not downsized.
    - Select a resolution using presets of 512, 1024 (possible future addition of others).
    - Select a preset aspect ratio
- cn-engine is used for generation, utilizing prompt and latent caching.
- Models are kept in memory between generations.
- Status display for:
    * Generation progress.
    * Model load status.
    * Items in queue

#### Future
- Initially hidden advanced controls for all other parameters accepted by cn-engine.
- Seed value will be random, but available for manual input in advanced controls.
- Input models also include text to video and image to video.
- Generate an image or video.
- Generate using multiple arbitrary API providers.
- Generate using multiple arbitrary models via API providers.
- Automatically adjust generation settings based on users hardware.

### LIbrary Management and Media Viewing
- The core and focus of the application.
- Content can be added to it either through generation or importing.
#### MVP
- Goal: Easy culling of media, and engaging browsing of media.
- Filtering
    * MVP: star rating, status, media type
    * Future: model, upscaled status, edit status
- Thumbnail grid view 
- Users open media into a "loupe view" to browse.
- Loupe view has thumbnail film strip below
- Users can rate or "select" media.
- UI for viewing file and generation info
- Library must be highly performant with possibly thousands of images.
#### Future
- Filtering:
    * model, upscaled status, media type
- Users can add keywords to media
- Collections: A way to group images.
- Smart collections (automatically populated based on metadata settings)
- Lineage tracking: The ability to see every generation step leading to current media file. For example: text to image of "woman", image to image gen of "hat on woman", image to video of

## Future Features
- **IMPORTANT:** Do not spec the below, only keep in mind for UI/UX and architecture decisions.
### Advanced Dependency/Model Management
- Model sizes (quants) automatically tailored to users hardware.
- Interface to download/enable other quant sizes for both diffusion model and LLM encoder.
- Enable/disable ESRGAN upscaling models based on user needs and hardware.
- Gives intelligent recommendations for what models to use.
### Advanced API provider Management
- Enable/disable API providers
- Enter API keys
- Browse models available via live feeds and/or search from provider, and enable them for app.
### Prompt LIbrary and Prompt Editor
- Features for saving prompts, organizing them.
- Organize prompts into collections same as media.
- Elegant useful prompt editing.
- Ability to use a more advanced prompt editor when creating a prompt for generation.
### Library lineage features UI.
- Users can track/audit the generation chain leading up to current media file.
### Non-destructive Image Adjustments
- Both slider based for entire image, and local adjustments via brush.
- Users can adjust brightness, contrast, etc in a non-destructive way using webgl and image canvas.
- Adjustments persisted to exported media and generation input media via rendering webgl canvas to disk.
- Local adjustments correctly apply regardless of image scaling or cropping.
### Non-destructive Upscaling
- Upscaling via ESRGAN based models.
- Upscaling produces versions that can be switched between, maintaining any cropping, removals, and local adjustments.
### Image and Video cropping.
- Images and videos can be cropped non-destructively.
- Images can be rotated or flipped.
- Local adjustments, removals maintain correctly placement despite cropping and upscaling.
- Crops and rotations persisted to exported media and generation input media via rendering webgl canvas to disk.
# Video Cropping
- Non destructive trimming of video.
- Trimmed video persisted on video export.
### Removals Tool
- Brush based image erasing/removals using Lama inpainting via onnx. 
- Non-destuctive, showing each removal and ability to toggle removals on and off.

## Architecture
- All image management should be database driven.
    * Ratings, selection status
- Use canvas for displaying full size images in the library.
    * This will allow us to add WebGL image adjustments in a future phase.
- Create a queue system for GPU/CPU usage.
    * MVP: Local image generation only.
- Generations may come from multiple sources: local, arbitrary API, arbitrary model name even for same actual base model.
    * All models, regardless of source will need to be associated with the base/core/actual model. e.g., "Flux 2 Klein 9b" may be called arbitrarily different things by different providers, but will still ultimately need to be grouped with all other Flux 2 Klein 9b generations for display and filtering purposes.
- Generations need to maintain permanent links to their input and output media.
    - Input image thumbnails need to persist whether or not that input media was deleted.

## DB Schema
### MVP
- This isn't exhaustive, just thought starters.
- Media: records storing metadata associated with individual media.
    - file name and/or path, relative to a predetermined root directory
- Generations
    - Should maintain links to library items that were input media.
    - SHould maintain links to the library items it generated
    - Stores all generation parameters. These wll be arbitrary based on provider/model.
- Queue
- Origin 
    - generation or import for MVP. Sketch of duplicate for future.
### Future
- Collections
- Import folders

# Resources

## condenser.cpp
C:\Users\jason\condenser.cpp\README.md
C:\Users\jason\condenser.cpp\AGENTS.md
C:\Users\jason\condenser.cpp\tools\engine\README.md

# shadcn
https://ui.shadcn.com/docs/installation
https://ui.shadcn.com/docs.md
https://ui.shadcn.com/docs/components.md
https://ui.shadcn.com/docs/installation.md

# Hypothetical components. json
C:\Users\jason\distillery\docs\shadcn.md



