export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type TimestampedRow = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      categories: TableDefinition<
        TimestampedRow & {
          id: string;
          slug: string;
          name: string;
          eyebrow: string;
          description: string;
          status: 'draft' | 'published' | 'archived';
          ranking_config: Json;
          constraint_schema: Json;
        }
      >;
      attribute_definitions: TableDefinition<
        TimestampedRow & {
          id: string;
          category_id: string;
          key: string;
          label: string;
          low_label: string;
          high_label: string;
          default_value: number;
          weight: number;
          sort_order: number;
          enabled: boolean;
        }
      >;
      sources: TableDefinition<
        TimestampedRow & {
          id: string;
          slug: string;
          name: string;
          adapter_type: string;
          base_url: string | null;
          enabled: boolean;
          display_policy: 'LINK_ONLY' | 'EMBED' | 'PREVIEW' | 'LICENSED' | 'BUYABLE';
          adapter_version: string;
          configuration: Json;
          status: 'idle' | 'running' | 'healthy' | 'degraded' | 'disabled';
          last_run_at: string | null;
          last_success_at: string | null;
        }
      >;
      ingestion_runs: TableDefinition<{
        id: string;
        source_id: string;
        status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
        adapter_version: string;
        started_at: string | null;
        finished_at: string | null;
        imported_count: number;
        updated_count: number;
        skipped_count: number;
        duplicate_count: number;
        failed_count: number;
        error_summary: string | null;
        metadata: Json;
        created_at: string;
      }>;
      analysis_runs: TableDefinition<{
        id: string;
        item_id: string | null;
        category_id: string | null;
        source_url: string | null;
        job_id: string | null;
        provider: string;
        model: string;
        schema_version: string;
        prompt_version: string;
        status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
        attempt: number;
        started_at: string | null;
        finished_at: string | null;
        runtime_ms: number | null;
        structured_result: Json | null;
        raw_result: Json | null;
        usage_metadata: Json;
        error_message: string | null;
        created_at: string;
      }>;
      items: TableDefinition<
        TimestampedRow & {
          id: string;
          public_id: string;
          category_id: string;
          source_id: string | null;
          source_external_id: string | null;
          title: string;
          creator: string | null;
          source_site: string;
          canonical_source_url: string | null;
          image_url: string;
          price_amount: number | null;
          price_currency: string | null;
          price_label: string | null;
          buyable: boolean;
          availability: boolean | null;
          note: string | null;
          structured_metadata: Json;
          publication_status: 'draft' | 'review' | 'published' | 'rejected' | 'archived';
          review_status: 'unreviewed' | 'approved' | 'needs_review' | 'rejected';
          first_seen_at: string;
          last_seen_at: string | null;
        }
      >;
      item_attribute_values: TableDefinition<{
        item_id: string;
        attribute_id: string;
        category_id: string;
        value: number;
        confidence: number | null;
        analysis_run_id: string | null;
        source: 'manual' | 'imported' | 'analysis' | 'corrected';
        created_at: string;
        updated_at: string;
      }>;
      ingestion_errors: TableDefinition<{
        id: string;
        ingestion_run_id: string;
        source_external_id: string | null;
        stage: string;
        code: string | null;
        message: string;
        context: Json;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
