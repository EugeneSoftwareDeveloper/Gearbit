using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;

namespace Gearbit.Hub.UserData;

/// <summary>
/// HTTP-часть хаба для интерфейса: настройки (/api/settings). Робот через HTTP не управляется — только через /ws.
/// </summary>
internal static class HttpApi
{
    public static void Map(WebApplication app, IReadOnlySet<string> allowedOrigins)
    {
        app.MapGet("/api/settings", (SettingsStore store) =>
            store.Read() is { } settings ? Results.Json(settings) : Results.NotFound());

        app.MapPut("/api/settings", async (HttpContext context, SettingsStore store) =>
        {
            var (body, refused) = await ReadJsonAsync(context, allowedOrigins, SettingsStore.MaxBytes).ConfigureAwait(false);
            if (refused is not null)
            {
                return refused;
            }

            if (body is not JsonObject settings)
            {
                return Results.BadRequest();
            }

            store.Write(settings);
            return Results.NoContent();
        });
    }

    /// <summary>
    /// Тело запроса на запись, если его можно принять. Писать может только свой интерфейс:
    /// Origin — из разрешённых (без Origin — не браузер, как Python и C#), тип — application/json.
    /// Чужой сайт не отправит application/json без CORS-предзапроса, а предзапросы хаб не разрешает.
    /// </summary>
    internal static async Task<(JsonNode? Body, IResult? Refused)> ReadJsonAsync(HttpContext context, IReadOnlySet<string> allowedOrigins, long maxBytes)
    {
        var origin = context.Request.Headers.Origin.ToString();
        if (origin.Length > 0 && !allowedOrigins.Contains(origin))
        {
            return (null, Results.StatusCode(StatusCodes.Status403Forbidden));
        }

        if (!context.Request.HasJsonContentType())
        {
            return (null, Results.StatusCode(StatusCodes.Status415UnsupportedMediaType));
        }

        if (context.Request.ContentLength > maxBytes)
        {
            return (null, Results.StatusCode(StatusCodes.Status413PayloadTooLarge));
        }

        if (context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
        {
            limit.MaxRequestBodySize = maxBytes;
        }

        try
        {
            return (await JsonNode.ParseAsync(context.Request.Body, cancellationToken: context.RequestAborted).ConfigureAwait(false), null);
        }
        catch (JsonException)
        {
            return (null, Results.BadRequest());
        }
        catch (BadHttpRequestException e) when (e.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return (null, Results.StatusCode(StatusCodes.Status413PayloadTooLarge));
        }
    }
}
