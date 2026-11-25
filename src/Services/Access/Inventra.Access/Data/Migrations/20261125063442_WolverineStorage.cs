using Inventra.BuildingBlocks.Messaging.Storage;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Inventra.Access.Data.Migrations
{
    /// <inheritdoc />
    public partial class WolverineStorage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Wolverine\'s outbox, inbox and node tables, owned by the migrator (see WolverineStorageMigrations).
            migrationBuilder.CreateWolverineStorage("6.63");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP SCHEMA IF EXISTS wolverine CASCADE;");
        }
    }
}
