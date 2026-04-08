DO $$ BEGIN
 CREATE TYPE "public"."organization_status" AS ENUM('active', 'suspended');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."application_status" AS ENUM('active', 'inactive', 'suspended');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."auth_protocol" AS ENUM('saml', 'oidc', 'jwt');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."mfa_factor_type" AS ENUM('totp', 'webauthn');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'suspended');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."signing_key_algorithm" AS ENUM('RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."signing_key_status" AS ENUM('active', 'rotating', 'retired', 'revoked');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."session_status" AS ENUM('active', 'expired', 'revoked');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"status" "organization_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"protocol" "auth_protocol" NOT NULL,
	"status" "application_status" DEFAULT 'active' NOT NULL,
	"logo_url" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jwt_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"allowed_algorithms" text[] DEFAULT ARRAY['RS256']::text[] NOT NULL,
	"allowed_audiences" text[] DEFAULT '{}'::text[] NOT NULL,
	"certificate_thumbprint" text,
	"token_ttl" integer DEFAULT 3600 NOT NULL,
	"require_mtls" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jwt_configs_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oidc_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_hash" text,
	"redirect_uris" text[] DEFAULT '{}'::text[] NOT NULL,
	"post_logout_redirect_uris" text[] DEFAULT '{}'::text[] NOT NULL,
	"grant_types" text[] DEFAULT ARRAY['authorization_code']::text[] NOT NULL,
	"response_types" text[] DEFAULT ARRAY['code']::text[] NOT NULL,
	"scopes" text DEFAULT 'openid profile email' NOT NULL,
	"require_pkce" boolean DEFAULT true NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'client_secret_basic' NOT NULL,
	"access_token_ttl" integer DEFAULT 3600 NOT NULL,
	"refresh_token_ttl" integer DEFAULT 86400 NOT NULL,
	"id_token_ttl" integer DEFAULT 3600 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saml_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"acs_url" text NOT NULL,
	"slo_url" text,
	"sp_certificate" text,
	"name_id_format" text DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress' NOT NULL,
	"sign_assertions" boolean DEFAULT true NOT NULL,
	"sign_response" boolean DEFAULT true NOT NULL,
	"encrypt_assertions" boolean DEFAULT false NOT NULL,
	"attribute_mappings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allowed_clock_skew_ms" integer DEFAULT 30000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_mfa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"factor_type" "mfa_factor_type" NOT NULL,
	"secret" text,
	"credential_id" text,
	"public_key" text,
	"backup_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"first_name" text,
	"last_name" text,
	"display_name" text,
	"picture_url" text,
	"locale" text DEFAULT 'en',
	"zone_info" text,
	"phone_number" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"failed_login_attempts" text DEFAULT '0' NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signing_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"algorithm" "signing_key_algorithm" DEFAULT 'RS256' NOT NULL,
	"status" "signing_key_status" DEFAULT 'active' NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"encryption_iv" text NOT NULL,
	"public_key" text NOT NULL,
	"public_key_jwk" text NOT NULL,
	"key_id" text NOT NULL,
	"certificate" text,
	"expires_at" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sso_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"amr" text[] DEFAULT '{}'::text[] NOT NULL,
	"participating_app_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jwt_configs" ADD CONSTRAINT "jwt_configs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oidc_clients" ADD CONSTRAINT "oidc_clients_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saml_configs" ADD CONSTRAINT "saml_configs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scopes" ADD CONSTRAINT "scopes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_mfa" ADD CONSTRAINT "user_mfa_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signing_keys" ADD CONSTRAINT "signing_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sso_sessions" ADD CONSTRAINT "sso_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sso_sessions" ADD CONSTRAINT "sso_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_idx" ON "organizations" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_status_idx" ON "organizations" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roles_organization_id_idx" ON "roles" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_org_name_idx" ON "roles" ("organization_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_roles_user_id_idx" ON "user_roles" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_roles_role_id_idx" ON "user_roles" ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_user_role_idx" ON "user_roles" ("user_id","role_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_organization_id_idx" ON "applications" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "applications_slug_idx" ON "applications" ("organization_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_status_idx" ON "applications" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jwt_configs_application_id_idx" ON "jwt_configs" ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jwt_configs_client_id_idx" ON "jwt_configs" ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oidc_clients_application_id_idx" ON "oidc_clients" ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oidc_clients_client_id_idx" ON "oidc_clients" ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saml_configs_application_id_idx" ON "saml_configs" ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "saml_configs_entity_id_idx" ON "saml_configs" ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scopes_application_id_idx" ON "scopes" ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scopes_app_name_idx" ON "scopes" ("application_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_mfa_user_id_idx" ON "user_mfa" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_mfa_factor_type_idx" ON "user_mfa" ("factor_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_organization_id_idx" ON "users" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_org_email_idx" ON "users" ("organization_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signing_keys_organization_id_idx" ON "signing_keys" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signing_keys_status_idx" ON "signing_keys" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "signing_keys_key_id_idx" ON "signing_keys" ("organization_id","key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sso_sessions_organization_id_idx" ON "sso_sessions" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sso_sessions_user_id_idx" ON "sso_sessions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sso_sessions_status_idx" ON "sso_sessions" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sso_sessions_expires_at_idx" ON "sso_sessions" ("expires_at");