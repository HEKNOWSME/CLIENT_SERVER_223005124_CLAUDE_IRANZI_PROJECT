ALTER TABLE "medical_files"
  ADD COLUMN "local_content" BYTEA,
  ADD CONSTRAINT "medical_files_local_size_matches"
    CHECK ("local_content" IS NULL OR octet_length("local_content") = "size_bytes");
