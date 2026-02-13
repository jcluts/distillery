-- =============================================================================
-- Model manager settings migration
-- =============================================================================

DELETE FROM app_settings WHERE key IN (
  'diffusion_model_path',
  'vae_path',
  'llm_path'
);

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('model_base_path', 'null');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('active_model_id', '"flux2-klein-4b"');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES (
  'model_quant_selections',
  '{"flux2-klein-4b":{"diffusionQuant":"","textEncoderQuant":""},"flux2-klein-9b":{"diffusionQuant":"","textEncoderQuant":""}}'
);
