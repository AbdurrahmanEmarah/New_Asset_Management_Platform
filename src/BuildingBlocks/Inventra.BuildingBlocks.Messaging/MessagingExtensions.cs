using System.Reflection;
using JasperFx.CodeGeneration.Model;
using JasperFx.Core;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Azure.Identity;
using Wolverine;
using Wolverine.AzureServiceBus;
using Wolverine.EntityFrameworkCore;
using Wolverine.ErrorHandling;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

namespace Inventra.BuildingBlocks.Messaging;

/// <summary>
/// Messaging between services with Wolverine:
/// <list type="bullet">
/// <item>A transactional outbox and inbox in the service's own PostgreSQL database (schema "wolverine"),
/// so an event is sent if and only if the change that caused it was saved.</item>
/// <item>RabbitMQ when ConnectionStrings:rabbitmq is set (the AppHost sets it). Each service publishes
/// its events to one fanout exchange, <c>inventra.&lt;service&gt;.events</c>, and reads the events it
/// subscribes to from its own queue, <c>&lt;service&gt;.&lt;publisher&gt;-events</c>.</item>
/// <item>Azure Service Bus when ServiceBus:FullyQualifiedNamespace is set (Azure), signed in with
/// DefaultAzureCredential. Each service publishes to the topic <c>inventra.&lt;service&gt;.events</c> and reads
/// from its own subscription, named after itself, on each topic it subscribes to. Topics and
/// subscriptions are created by the infrastructure unless Messaging:AutoProvision is true.</item>
/// <item>No broker (tests): events stay in the process, handled by local queues if this service has a handler.</item>
/// </list>
/// </summary>
public static class MessagingExtensions
{
    public const string BrokerConnectionName = "rabbitmq";
    public const string Schema = "wolverine";

    public static string ExchangeFor(string service) => $"inventra.{service}.events";

    public static string QueueFor(string subscriber, string publisher) => $"{subscriber}.{publisher}-events";

    /// <param name="service">This service's short name, e.g. "access".</param>
    /// <param name="databaseConnectionName">The service's database; the outbox lives there.</param>
    /// <param name="applicationAssembly">Where the service's message handlers are (typeof(Program).Assembly).</param>
    /// <param name="publishesNamespaceOf">A contract type from the namespace whose messages this service publishes.</param>
    /// <param name="subscribesTo">Services whose events this service handles.</param>
    public static IHostApplicationBuilder AddInventraMessaging(
        this IHostApplicationBuilder builder,
        string service,
        string databaseConnectionName,
        Assembly applicationAssembly,
        Type publishesNamespaceOf,
        string[] subscribesTo,
        Action<WolverineOptions>? configure = null)
    {
        var database = builder.Configuration.GetConnectionString(databaseConnectionName)
            ?? throw new InvalidOperationException($"Connection string '{databaseConnectionName}' is missing. Set ConnectionStrings:{databaseConnectionName}.");
        var broker = builder.Configuration.GetConnectionString(BrokerConnectionName);
        var serviceBus = builder.Configuration["ServiceBus:FullyQualifiedNamespace"];

        builder.UseWolverine(opts =>
        {
            opts.ServiceName = service;
            opts.ApplicationAssembly = applicationAssembly;

            // Database contexts are registered with factories (row-level security needs the
            // request's tenant), so handlers resolve them from the container.
            opts.ServiceLocationPolicy = ServiceLocationPolicy.AlwaysAllowed;
            opts.PersistMessagesWithPostgresql(new Npgsql.NpgsqlConnectionStringBuilder(database)
            {
                MaxPoolSize = builder.Configuration.GetValue("Messaging:MaxPoolSize", 5),
            }.ConnectionString, Schema);
            opts.UseEntityFrameworkCoreTransactions();

            opts.Policies.UseDurableLocalQueues();
            opts.Policies.UseDurableInboxOnAllListeners();
            opts.Policies.UseDurableOutboxOnAllSendingEndpoints();

            // A handler that fails is retried with growing pauses, then the message goes to the
            // dead-letter table (wolverine_dead_letters), where it can be inspected and replayed.
            opts.Policies.OnAnyException()
                .RetryWithCooldown(200.Milliseconds(), 1.Seconds(), 5.Seconds())
                .Then.ScheduleRetry(30.Seconds(), 2.Minutes(), 10.Minutes())
                .Then.MoveToErrorQueue();

            if (!string.IsNullOrWhiteSpace(serviceBus))
            {
                var bus = opts.UseAzureServiceBus(serviceBus, new DefaultAzureCredential());
                if (builder.Configuration.GetValue("Messaging:AutoProvision", false)) bus.AutoProvision();

                opts.Publish(p =>
                {
                    p.MessagesFromNamespace(publishesNamespaceOf.Namespace!);
                    p.ToAzureServiceBusTopic(ExchangeFor(service));
                });

                foreach (var publisher in subscribesTo)
                {
                    opts.ListenToAzureServiceBusSubscription(service).FromTopic(ExchangeFor(publisher));
                }
            }
            else if (!string.IsNullOrWhiteSpace(broker))
            {
                var rabbit = opts.UseRabbitMq(new Uri(broker)).AutoProvision();

                opts.Publish(p =>
                {
                    p.MessagesFromNamespace(publishesNamespaceOf.Namespace!);
                    p.ToRabbitExchange(ExchangeFor(service), e => e.ExchangeType = ExchangeType.Fanout);
                });

                foreach (var publisher in subscribesTo)
                {
                    var queue = QueueFor(service, publisher);
                    rabbit.DeclareExchange(ExchangeFor(publisher), e =>
                    {
                        e.ExchangeType = ExchangeType.Fanout;
                        e.BindQueue(queue);
                    });
                    opts.ListenToRabbitQueue(queue);
                }
            }

            configure?.Invoke(opts);
        });

        return builder;
    }
}
