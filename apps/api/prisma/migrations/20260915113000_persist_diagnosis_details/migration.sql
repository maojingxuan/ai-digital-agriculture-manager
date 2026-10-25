-- Preserve the complete YOLO/RAG result instead of only the basic diagnosis fields.
ALTER TABLE "disease_diagnoses" ADD COLUMN "annotated_image_url" TEXT;
ALTER TABLE "disease_diagnoses" ADD COLUMN "model_name" TEXT;
ALTER TABLE "disease_diagnoses" ADD COLUMN "detections" JSONB;
ALTER TABLE "disease_diagnoses" ADD COLUMN "rag_references" JSONB;
ALTER TABLE "disease_diagnoses" ADD COLUMN "vision_error" TEXT;
