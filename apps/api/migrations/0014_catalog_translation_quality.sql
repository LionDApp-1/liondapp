-- Requeue the early translations after replacing the literal translation model.
-- Source text is preserved; new translations are published only as complete items.
UPDATE store_catalog SET subtitle_zh=NULL,description_zh=NULL,category_name_zh=NULL,
  translated_at=NULL,translation_attempts=0,translation_retry_at=NULL;
