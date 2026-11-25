using Inventra.Contracts.Catalog;

namespace Inventra.Catalog.Domain;

/// <summary>The presets the platform starts with. The Platform Owner can change them in the admin console.</summary>
public static class TemplateLibrary
{
    public static readonly DateTimeOffset Seeded = new(2026, 11, 25, 0, 0, 0, TimeSpan.Zero);

    private static readonly List<StatusDefinition> StandardStatuses =
    [
        new("in_service", "In service", "ok", 0),
        new("needs_attention", "Needs attention", "warn", 1),
        new("out_of_service", "Out of service", "fault", 2),
        new("in_storage", "In storage", "info", 3),
        new("retired", "Retired", "none", 4),
    ];

    private static FieldDefinition Text(string key, string label, bool required = false, int max = 120) =>
        new(key, label, FieldKind.Text, required, 0, new FieldRules(MaxLength: max));

    private static FieldDefinition Number(string key, string label, string? unit, decimal? min = 0, int decimals = 2) =>
        new(key, label, FieldKind.Number, false, 0, new FieldRules(Min: min, Decimals: decimals, Unit: unit));

    private static FieldDefinition Date(string key, string label, bool notInFuture = false) =>
        new(key, label, FieldKind.Date, false, 0, new FieldRules(NotInFuture: notInFuture));

    private static FieldDefinition Choice(string key, string label, params string[] options) =>
        new(key, label, FieldKind.Choice, false, 0, new FieldRules(Options: options));

    public static IReadOnlyList<AssetTemplate> Defaults { get; } =
    [
        new()
        {
            Key = "hvac_unit", Name = "HVAC unit", Category = "Building services", TagPrefix = "HVAC", IconKey = "fan",
            Description = "Air handlers, chillers and split units.",
            Fields = [Text("manufacturer", "Manufacturer"), Text("model", "Model"), Text("serial_no", "Serial number"),
                Number("capacity_kw", "Cooling capacity", "kW"), Choice("refrigerant", "Refrigerant", "R-32", "R-410A", "R-134a", "R-290"),
                Date("installed_on", "Installed on", notInFuture: true), Date("warranty_until", "Warranty until"),
                new("assigned_to", "Responsible person", FieldKind.Person, false, 0, new FieldRules())],
            Statuses = StandardStatuses, UpdatedAt = Seeded,
        },
        new()
        {
            Key = "vehicle", Name = "Vehicle", Category = "Fleet", TagPrefix = "VEH", IconKey = "truck",
            Description = "Cars, vans and trucks.",
            Fields = [Text("registration", "Registration", required: true, max: 16), Text("make_model", "Make and model"),
                Text("vin", "VIN", max: 17), Number("odometer_km", "Odometer", "km", decimals: 0),
                Choice("fuel", "Fuel", "Petrol", "Diesel", "Hybrid", "Electric"), Date("next_service", "Next service due"),
                new("driver", "Driver", FieldKind.Person, false, 0, new FieldRules())],
            Statuses = StandardStatuses, UpdatedAt = Seeded,
        },
        new()
        {
            Key = "pump", Name = "Pump", Category = "Mechanical", TagPrefix = "PMP", IconKey = "droplet",
            Description = "Water, fire and process pumps.",
            Fields = [Text("manufacturer", "Manufacturer"), Text("serial_no", "Serial number"), Number("flow_m3h", "Flow rate", "m³/h"),
                Number("power_kw", "Motor power", "kW"), Choice("duty", "Duty", "Duty", "Standby", "Jockey"),
                new("parent_system", "Part of system", FieldKind.Asset, false, 0, new FieldRules()),
                new("datasheet", "Datasheet", FieldKind.File, false, 0, new FieldRules())],
            Statuses = StandardStatuses, UpdatedAt = Seeded,
        },
        new()
        {
            Key = "it_device", Name = "IT device", Category = "IT", TagPrefix = "IT", IconKey = "laptop",
            Description = "Laptops, desktops, tablets and phones.",
            Fields = [Choice("device_type", "Device type", "Laptop", "Desktop", "Tablet", "Phone"), Text("serial_no", "Serial number"),
                Text("hostname", "Host name", max: 63), Date("purchased_on", "Purchased on", notInFuture: true),
                Number("cost", "Purchase cost", null), new("assigned_to", "Assigned to", FieldKind.Person, false, 0, new FieldRules())],
            Statuses = StandardStatuses, UpdatedAt = Seeded,
        },
    ];

    static TemplateLibrary()
    {
        foreach (var t in Defaults)
        {
            t.Fields = t.Fields.Select((f, i) => f with { Order = i }).ToList();
        }
    }
}
