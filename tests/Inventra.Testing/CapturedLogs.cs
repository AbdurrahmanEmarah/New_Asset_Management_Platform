using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Inventra.Testing;

/// <summary>Keeps every formatted log line a service writes during the tests, so tests can check what is logged.</summary>
public sealed class CapturedLogs : ILoggerProvider
{
    private readonly ConcurrentQueue<(string Category, LogLevel Level, string Message)> _lines = new();

    public IReadOnlyList<(string Category, LogLevel Level, string Message)> Lines => _lines.ToList();

    public ILogger CreateLogger(string categoryName) => new Logger(categoryName, _lines);

    public void Dispose() { }

    private sealed class Logger(string category, ConcurrentQueue<(string, LogLevel, string)> lines) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            lines.Enqueue((category, logLevel, formatter(state, exception) + (exception is null ? "" : " " + exception)));
    }
}
