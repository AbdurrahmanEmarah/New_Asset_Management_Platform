using Microsoft.Extensions.DependencyInjection;
using Wolverine;

namespace Inventra.Testing;

public static class TestMessagingExtensions
{
    /// <summary>
    /// Runs Wolverine as a single node with no broker: published events stay in the process,
    /// and tests check them with Wolverine's message tracking (TrackActivity).
    /// </summary>
    public static IServiceCollection AddTestMessaging(this IServiceCollection services)
    {
        services.UseWolverineSoloMode();
        services.DisableAllExternalWolverineTransports();
        return services;
    }
}
