using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Inventra.Tenancy.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "plans",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    name = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    max_users = table.Column<int>(type: "integer", nullable: false),
                    max_assets = table.Column<int>(type: "integer", nullable: false),
                    storage_gb = table.Column<int>(type: "integer", nullable: false),
                    modules = table.Column<List<string>>(type: "text[]", nullable: false),
                    is_trial = table.Column<bool>(type: "boolean", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_plans", x => x.key);
                });

            migrationBuilder.CreateTable(
                name: "platform_audit",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    actor_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    actor_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: true),
                    client_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    details = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_platform_audit", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "clients",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    slug = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    region = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    plan_key = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    owner_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    owner_email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    trial_ends_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    suspended_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    suspended_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    users_used = table.Column<int>(type: "integer", nullable: false),
                    assets_used = table.Column<int>(type: "integer", nullable: false),
                    storage_used_mb = table.Column<long>(type: "bigint", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_clients", x => x.id);
                    table.ForeignKey(
                        name: "fk_clients_plans_plan_key",
                        column: x => x.plan_key,
                        principalTable: "plans",
                        principalColumn: "key",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "plans",
                columns: new[] { "key", "is_trial", "max_assets", "max_users", "modules", "name", "sort_order", "storage_gb" },
                values: new object[,]
                {
                    { "business", false, 10000, 200, new List<string> { "assets", "maintenance", "inventory", "integrations" }, "Business", 2, 100 },
                    { "enterprise", false, 50000, 1000, new List<string> { "assets", "maintenance", "inventory", "integrations", "reporting" }, "Enterprise", 3, 500 },
                    { "starter", false, 2000, 25, new List<string> { "assets", "maintenance" }, "Starter", 1, 20 },
                    { "trial", true, 500, 10, new List<string> { "assets", "maintenance" }, "Trial", 0, 5 }
                });

            migrationBuilder.CreateIndex(
                name: "ix_clients_plan_key",
                table: "clients",
                column: "plan_key");

            migrationBuilder.CreateIndex(
                name: "ix_clients_slug",
                table: "clients",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_platform_audit_at",
                table: "platform_audit",
                column: "at");

            migrationBuilder.CreateIndex(
                name: "ix_platform_audit_client_id_at",
                table: "platform_audit",
                columns: new[] { "client_id", "at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "clients");

            migrationBuilder.DropTable(
                name: "platform_audit");

            migrationBuilder.DropTable(
                name: "plans");
        }
    }
}
