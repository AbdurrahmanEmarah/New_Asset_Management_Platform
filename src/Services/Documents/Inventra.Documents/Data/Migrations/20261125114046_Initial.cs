using System;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Messaging.Storage;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Inventra.Documents.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "documents",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    asset_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    content_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    blob_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    uploaded_by_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    uploaded_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    uploaded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_documents", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "storage_limits",
                columns: table => new
                {
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    limit_bytes = table.Column<long>(type: "bigint", nullable: false),
                    changed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_storage_limits", x => x.tenant_id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_documents_tenant_id_asset_id",
                table: "documents",
                columns: new[] { "tenant_id", "asset_id" });

            migrationBuilder.CreateRowSecurityRole("wolverine");
            migrationBuilder.EnableTenantRowSecurity("documents");
            migrationBuilder.EnableTenantRowSecurity("storage_limits");
            migrationBuilder.CreateWolverineStorage("6.63");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "documents");

            migrationBuilder.DropTable(
                name: "storage_limits");
        }
    }
}
