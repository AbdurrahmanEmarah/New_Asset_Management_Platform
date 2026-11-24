using System.Collections.Concurrent;

namespace Inventra.Testing;

/// <summary>
/// Events a service published during the tests, as received by a recording handler on a local
/// queue. Tests share one host, so always match on something the test owns (such as a client id).
/// </summary>
public sealed class PublishedEvents
{
    private readonly ConcurrentQueue<object> _events = new();

    public void Add(object message) => _events.Enqueue(message);

    public IReadOnlyList<T> All<T>() => _events.OfType<T>().ToList();

    /// <summary>Waits until a matching event arrives (the outbox delivers it shortly after the save).</summary>
    public async Task<T> WaitForAsync<T>(Func<T, bool> match, TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(15));
        while (DateTime.UtcNow < deadline)
        {
            if (_events.OfType<T>().LastOrDefault(match) is { } found) return found;
            await Task.Delay(50);
        }

        throw new TimeoutException($"No {typeof(T).Name} matching the test arrived within {(timeout ?? TimeSpan.FromSeconds(15)).TotalSeconds}s. Published so far: {_events.Count} event(s).");
    }
}
