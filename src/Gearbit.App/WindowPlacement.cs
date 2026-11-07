using System.IO;
using System.Text.Json;
using System.Windows;

namespace Gearbit.App;

/// <summary>
/// Где было окно и какого размера: %LOCALAPPDATA%\Gearbit\window.json. Окно открывается там же,
/// если это место видно на экранах (монитор могли отключить).
/// </summary>
internal sealed record WindowPlacement(double Left, double Top, double Width, double Height, bool Maximized)
{
    private static readonly string FilePath = Path.Combine(AppText.DataDirectory, "window.json");

    public static void Restore(Window window)
    {
        WindowPlacement? saved;
        try
        {
            saved = JsonSerializer.Deserialize<WindowPlacement>(File.ReadAllText(FilePath));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException)
        {
            return;
        }

        if (saved is null || saved.Width < window.MinWidth || saved.Height < window.MinHeight || !IsVisible(saved))
        {
            return;
        }

        window.WindowStartupLocation = WindowStartupLocation.Manual;
        window.Left = saved.Left;
        window.Top = saved.Top;
        window.Width = saved.Width;
        window.Height = saved.Height;
        if (saved.Maximized)
        {
            window.WindowState = WindowState.Maximized;
        }
    }

    public static void Save(Window window)
    {
        var bounds = window.WindowState == WindowState.Normal
            ? new Rect(window.Left, window.Top, window.ActualWidth, window.ActualHeight)
            : window.RestoreBounds;
        if (bounds.IsEmpty)
        {
            return;
        }

        try
        {
            Directory.CreateDirectory(AppText.DataDirectory);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(
                new WindowPlacement(bounds.Left, bounds.Top, bounds.Width, bounds.Height, window.WindowState == WindowState.Maximized)));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Не сохранилось — в следующий раз окно откроется посередине.
        }
    }

    /// <summary>Хотя бы заголовок окна виден на одном из экранов.</summary>
    private static bool IsVisible(WindowPlacement p)
    {
        var screen = new Rect(SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenTop, SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight);
        var title = new Rect(p.Left, p.Top, p.Width, 40);
        title.Intersect(screen);
        return !title.IsEmpty && title.Width >= 100;
    }
}
