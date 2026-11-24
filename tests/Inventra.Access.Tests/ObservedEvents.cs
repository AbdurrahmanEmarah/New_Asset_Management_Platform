using Inventra.Contracts.Access;
using Inventra.Testing;

namespace Inventra.Access.Tests;

/// <summary>Stands in for Tenancy: records the events Access publishes.</summary>
public static class ObservedAccessEvents
{
    public static void Handle(ClientUsersCounted message, PublishedEvents events) => events.Add(message);

    public static void Handle(PlatformActivityRecorded message, PublishedEvents events) => events.Add(message);
}
