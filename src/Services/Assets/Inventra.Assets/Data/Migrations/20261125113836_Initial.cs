using System;
using System.Text.Json;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Messaging.Storage;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Inventra.Assets.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "asset_types",
                columns: table => new
                {
                    type_id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    tag_prefix = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    icon_key = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    fields = table.Column<string>(type: "jsonb", nullable: false),
                    statuses = table.Column<string>(type: "jsonb", nullable: false),
                    archived = table.Column<bool>(type: "boolean", nullable: false),
                    next_number = table.Column<int>(type: "integer", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_asset_types", x => x.type_id);
                });

            migrationBuilder.CreateTable(
                name: "client_limits",
                columns: table => new
                {
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    max_assets = table.Column<int>(type: "integer", nullable: false),
                    changed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_client_limits", x => x.tenant_id);
                });

            migrationBuilder.CreateTable(
                name: "assets",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type_id = table.Column<Guid>(type: "uuid", nullable: false),
                    tag = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    status_key = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    site_id = table.Column<Guid>(type: "uuid", nullable: true),
                    location = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    parent_id = table.Column<Guid>(type: "uuid", nullable: true),
                    values = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    retired_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    retired_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_assets", x => x.id);
                    table.ForeignKey(
                        name: "fk_assets_asset_types_type_id",
                        column: x => x.type_id,
                        principalTable: "asset_types",
                        principalColumn: "type_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_assets_assets_parent_id",
                        column: x => x.parent_id,
                        principalTable: "assets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_asset_types_tenant_id",
                table: "asset_types",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "ix_assets_parent_id",
                table: "assets",
                column: "parent_id");

            migrationBuilder.CreateIndex(
                name: "ix_assets_tenant_id_parent_id",
                table: "assets",
                columns: new[] { "tenant_id", "parent_id" });

            migrationBuilder.CreateIndex(
                name: "ix_assets_tenant_id_site_id",
                table: "assets",
                columns: new[] { "tenant_id", "site_id" });

            migrationBuilder.CreateIndex(
                name: "ix_assets_tenant_id_tag",
                table: "assets",
                columns: new[] { "tenant_id", "tag" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_assets_tenant_id_type_id",
                table: "assets",
                columns: new[] { "tenant_id", "type_id" });

            migrationBuilder.CreateIndex(
                name: "ix_assets_type_id",
                table: "assets",
                column: "type_id");

            migrationBuilder.CreateRowSecurityRole("wolverine");
            foreach (var table in new[] { "assets", "asset_types", "client_limits" })
            {
                migrationBuilder.EnableTenantRowSecurity(table);
            }

            migrationBuilder.CreateWolverineStorage("6.63");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assets");

            migrationBuilder.DropTable(
                name: "client_limits");

            migrationBuilder.DropTable(
                name: "asset_types");
        }
    }
}
