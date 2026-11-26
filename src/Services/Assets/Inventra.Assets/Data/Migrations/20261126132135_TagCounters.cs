using System;
using Inventra.BuildingBlocks.Data;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Inventra.Assets.Data.Migrations
{
    /// <inheritdoc />
    public partial class TagCounters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "next_number",
                table: "asset_types");

            migrationBuilder.CreateTable(
                name: "tag_counters",
                columns: table => new
                {
                    type_id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    next_number = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_tag_counters", x => x.type_id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_tag_counters_tenant_id",
                table: "tag_counters",
                column: "tenant_id");

            // No backfill here: forced row-level security hides every client's rows from the migrator.
            // Each type's counter is created on first use, continuing after its highest existing tag.
            migrationBuilder.EnableTenantRowSecurity("tag_counters");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tag_counters");

            migrationBuilder.AddColumn<int>(
                name: "next_number",
                table: "asset_types",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }
    }
}
