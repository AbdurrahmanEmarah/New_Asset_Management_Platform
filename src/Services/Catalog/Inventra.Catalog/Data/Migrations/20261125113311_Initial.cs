using System;
using Inventra.BuildingBlocks.Data;
using Inventra.BuildingBlocks.Messaging.Storage;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Inventra.Catalog.Data.Migrations
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
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    tag_prefix = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    icon_key = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    fields = table.Column<string>(type: "jsonb", nullable: false),
                    statuses = table.Column<string>(type: "jsonb", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    template_key = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_asset_types", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "templates",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    description = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    category = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    tag_prefix = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    icon_key = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    fields = table.Column<string>(type: "jsonb", nullable: false),
                    statuses = table.Column<string>(type: "jsonb", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_templates", x => x.key);
                });

            migrationBuilder.InsertData(
                table: "templates",
                columns: new[] { "key", "category", "description", "fields", "icon_key", "name", "statuses", "tag_prefix", "updated_at" },
                values: new object[,]
                {
                    { "hvac_unit", "Building services", "Air handlers, chillers and split units.", "[{\"key\":\"manufacturer\",\"label\":\"Manufacturer\",\"kind\":\"text\",\"required\":false,\"order\":0,\"rules\":{\"maxLength\":120,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"model\",\"label\":\"Model\",\"kind\":\"text\",\"required\":false,\"order\":1,\"rules\":{\"maxLength\":120,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"serial_no\",\"label\":\"Serial number\",\"kind\":\"text\",\"required\":false,\"order\":2,\"rules\":{\"maxLength\":120,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"capacity_kw\",\"label\":\"Cooling capacity\",\"kind\":\"number\",\"required\":false,\"order\":3,\"rules\":{\"min\":0,\"decimals\":2,\"unit\":\"kW\",\"multiple\":false,\"notInFuture\":false}},{\"key\":\"refrigerant\",\"label\":\"Refrigerant\",\"kind\":\"choice\",\"required\":false,\"order\":4,\"rules\":{\"options\":[\"R-32\",\"R-410A\",\"R-134a\",\"R-290\"],\"multiple\":false,\"notInFuture\":false}},{\"key\":\"installed_on\",\"label\":\"Installed on\",\"kind\":\"date\",\"required\":false,\"order\":5,\"rules\":{\"multiple\":false,\"notInFuture\":true}},{\"key\":\"warranty_until\",\"label\":\"Warranty until\",\"kind\":\"date\",\"required\":false,\"order\":6,\"rules\":{\"multiple\":false,\"notInFuture\":false}},{\"key\":\"assigned_to\",\"label\":\"Responsible person\",\"kind\":\"person\",\"required\":false,\"order\":7,\"rules\":{\"multiple\":false,\"notInFuture\":false}}]", "fan", "HVAC unit", "[{\"key\":\"in_service\",\"label\":\"In service\",\"meaning\":\"ok\",\"order\":0},{\"key\":\"needs_attention\",\"label\":\"Needs attention\",\"meaning\":\"warn\",\"order\":1},{\"key\":\"out_of_service\",\"label\":\"Out of service\",\"meaning\":\"fault\",\"order\":2},{\"key\":\"in_storage\",\"label\":\"In storage\",\"meaning\":\"info\",\"order\":3},{\"key\":\"retired\",\"label\":\"Retired\",\"meaning\":\"none\",\"order\":4}]", "HVAC", new DateTimeOffset(new DateTime(2026, 11, 25, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { "it_device", "IT", "Laptops, desktops, tablets and phones.", "[{\"key\":\"device_type\",\"label\":\"Device type\",\"kind\":\"choice\",\"required\":false,\"order\":0,\"rules\":{\"options\":[\"Laptop\",\"Desktop\",\"Tablet\",\"Phone\"],\"multiple\":false,\"notInFuture\":false}},{\"key\":\"serial_no\",\"label\":\"Serial number\",\"kind\":\"text\",\"required\":false,\"order\":1,\"rules\":{\"maxLength\":120,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"hostname\",\"label\":\"Host name\",\"kind\":\"text\",\"required\":false,\"order\":2,\"rules\":{\"maxLength\":63,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"purchased_on\",\"label\":\"Purchased on\",\"kind\":\"date\",\"required\":false,\"order\":3,\"rules\":{\"multiple\":false,\"notInFuture\":true}},{\"key\":\"cost\",\"label\":\"Purchase cost\",\"kind\":\"number\",\"required\":false,\"order\":4,\"rules\":{\"min\":0,\"decimals\":2,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"assigned_to\",\"label\":\"Assigned to\",\"kind\":\"person\",\"required\":false,\"order\":5,\"rules\":{\"multiple\":false,\"notInFuture\":false}}]", "laptop", "IT device", "[{\"key\":\"in_service\",\"label\":\"In service\",\"meaning\":\"ok\",\"order\":0},{\"key\":\"needs_attention\",\"label\":\"Needs attention\",\"meaning\":\"warn\",\"order\":1},{\"key\":\"out_of_service\",\"label\":\"Out of service\",\"meaning\":\"fault\",\"order\":2},{\"key\":\"in_storage\",\"label\":\"In storage\",\"meaning\":\"info\",\"order\":3},{\"key\":\"retired\",\"label\":\"Retired\",\"meaning\":\"none\",\"order\":4}]", "IT", new DateTimeOffset(new DateTime(2026, 11, 25, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { "pump", "Mechanical", "Water, fire and process pumps.", "[{\"key\":\"manufacturer\",\"label\":\"Manufacturer\",\"kind\":\"text\",\"required\":false,\"order\":0,\"rules\":{\"maxLength\":120,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"serial_no\",\"label\":\"Serial number\",\"kind\":\"text\",\"required\":false,\"order\":1,\"rules\":{\"maxLength\":120,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"flow_m3h\",\"label\":\"Flow rate\",\"kind\":\"number\",\"required\":false,\"order\":2,\"rules\":{\"min\":0,\"decimals\":2,\"unit\":\"m\\u00B3/h\",\"multiple\":false,\"notInFuture\":false}},{\"key\":\"power_kw\",\"label\":\"Motor power\",\"kind\":\"number\",\"required\":false,\"order\":3,\"rules\":{\"min\":0,\"decimals\":2,\"unit\":\"kW\",\"multiple\":false,\"notInFuture\":false}},{\"key\":\"duty\",\"label\":\"Duty\",\"kind\":\"choice\",\"required\":false,\"order\":4,\"rules\":{\"options\":[\"Duty\",\"Standby\",\"Jockey\"],\"multiple\":false,\"notInFuture\":false}},{\"key\":\"parent_system\",\"label\":\"Part of system\",\"kind\":\"asset\",\"required\":false,\"order\":5,\"rules\":{\"multiple\":false,\"notInFuture\":false}},{\"key\":\"datasheet\",\"label\":\"Datasheet\",\"kind\":\"file\",\"required\":false,\"order\":6,\"rules\":{\"multiple\":false,\"notInFuture\":false}}]", "droplet", "Pump", "[{\"key\":\"in_service\",\"label\":\"In service\",\"meaning\":\"ok\",\"order\":0},{\"key\":\"needs_attention\",\"label\":\"Needs attention\",\"meaning\":\"warn\",\"order\":1},{\"key\":\"out_of_service\",\"label\":\"Out of service\",\"meaning\":\"fault\",\"order\":2},{\"key\":\"in_storage\",\"label\":\"In storage\",\"meaning\":\"info\",\"order\":3},{\"key\":\"retired\",\"label\":\"Retired\",\"meaning\":\"none\",\"order\":4}]", "PMP", new DateTimeOffset(new DateTime(2026, 11, 25, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { "vehicle", "Fleet", "Cars, vans and trucks.", "[{\"key\":\"registration\",\"label\":\"Registration\",\"kind\":\"text\",\"required\":true,\"order\":0,\"rules\":{\"maxLength\":16,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"make_model\",\"label\":\"Make and model\",\"kind\":\"text\",\"required\":false,\"order\":1,\"rules\":{\"maxLength\":120,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"vin\",\"label\":\"VIN\",\"kind\":\"text\",\"required\":false,\"order\":2,\"rules\":{\"maxLength\":17,\"multiple\":false,\"notInFuture\":false}},{\"key\":\"odometer_km\",\"label\":\"Odometer\",\"kind\":\"number\",\"required\":false,\"order\":3,\"rules\":{\"min\":0,\"decimals\":0,\"unit\":\"km\",\"multiple\":false,\"notInFuture\":false}},{\"key\":\"fuel\",\"label\":\"Fuel\",\"kind\":\"choice\",\"required\":false,\"order\":4,\"rules\":{\"options\":[\"Petrol\",\"Diesel\",\"Hybrid\",\"Electric\"],\"multiple\":false,\"notInFuture\":false}},{\"key\":\"next_service\",\"label\":\"Next service due\",\"kind\":\"date\",\"required\":false,\"order\":5,\"rules\":{\"multiple\":false,\"notInFuture\":false}},{\"key\":\"driver\",\"label\":\"Driver\",\"kind\":\"person\",\"required\":false,\"order\":6,\"rules\":{\"multiple\":false,\"notInFuture\":false}}]", "truck", "Vehicle", "[{\"key\":\"in_service\",\"label\":\"In service\",\"meaning\":\"ok\",\"order\":0},{\"key\":\"needs_attention\",\"label\":\"Needs attention\",\"meaning\":\"warn\",\"order\":1},{\"key\":\"out_of_service\",\"label\":\"Out of service\",\"meaning\":\"fault\",\"order\":2},{\"key\":\"in_storage\",\"label\":\"In storage\",\"meaning\":\"info\",\"order\":3},{\"key\":\"retired\",\"label\":\"Retired\",\"meaning\":\"none\",\"order\":4}]", "VEH", new DateTimeOffset(new DateTime(2026, 11, 25, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) }
                });

            migrationBuilder.CreateIndex(
                name: "ix_asset_types_tenant_id_name",
                table: "asset_types",
                columns: new[] { "tenant_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_asset_types_tenant_id_tag_prefix",
                table: "asset_types",
                columns: new[] { "tenant_id", "tag_prefix" },
                unique: true);

            // Client data is protected by row-level security; templates are the platform's shared library.
            migrationBuilder.CreateRowSecurityRole("wolverine");
            migrationBuilder.EnableTenantRowSecurity("asset_types");
            migrationBuilder.CreateWolverineStorage("6.63");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "asset_types");

            migrationBuilder.DropTable(
                name: "templates");
        }
    }
}
