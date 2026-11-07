using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;

namespace Gearbit.App;

/// <summary>
/// Окно с веб-интерфейсом в WebView2. Ссылки наружу открываются в обычном браузере,
/// цвет заголовка окна следует теме интерфейса (день/ночь).
/// </summary>
public partial class MainWindow : Window
{
    private const string WebViewDownloadUrl = "https://developer.microsoft.com/microsoft-edge/webview2/";
    private Uri? _origin;

    public MainWindow()
    {
        InitializeComponent();
        var text = AppText.Current;
        SplashTitle.Text = text.Starting;
        InstallButton.Content = text.InstallWebView;
        BrowserButton.Content = text.OpenInBrowser;
        WindowPlacement.Restore(this);
        SourceInitialized += (_, _) => ApplyTheme(SystemPrefersDark());
        Closing += (_, _) => WindowPlacement.Save(this);
    }

    public async Task OpenAsync(string url)
    {
        _origin = new Uri(url);
        try
        {
            var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Gearbit", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: dataDir).ConfigureAwait(true);
            await Web.EnsureCoreWebView2Async(environment).ConfigureAwait(true);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            ShowError(AppText.Current.WebViewTitle, AppText.Current.WebViewText, offerInstall: true);
            return;
        }

        var core = Web.CoreWebView2;
        var settings = core.Settings;
        settings.IsStatusBarEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        settings.IsZoomControlEnabled = true;
#if !DEBUG
        settings.AreDevToolsEnabled = false;
        settings.AreDefaultContextMenusEnabled = false;
#endif

        core.NavigationStarting += OnNavigationStarting;
        core.NewWindowRequested += OnNewWindowRequested;
        core.WebMessageReceived += OnWebMessage;
        core.ProcessFailed += (_, _) => Web.Reload();
        core.NavigationCompleted += (_, args) =>
        {
            if (args.IsSuccess)
            {
                Splash.Visibility = Visibility.Collapsed;
                Web.Visibility = Visibility.Visible;
            }
        };

        Web.DefaultBackgroundColor = SystemPrefersDark() ? System.Drawing.Color.FromArgb(0x0F, 0x14, 0x20) : System.Drawing.Color.FromArgb(0xF4, 0xF6, 0xFB);
        Web.Source = _origin;
    }

    public void ShowError(string title, string message, bool offerInstall = false)
    {
        Web.Visibility = Visibility.Hidden;
        Splash.Visibility = Visibility.Visible;
        SplashTitle.Text = title;
        SplashText.Text = message;
        SplashButtons.Visibility = Visibility.Visible;
        InstallButton.Visibility = offerInstall ? Visibility.Visible : Visibility.Collapsed;
        BrowserButton.Visibility = _origin is null ? Visibility.Collapsed : Visibility.Visible;
    }

    /// <summary>Всё, что не наш хаб, открывается в браузере пользователя, а не внутри окна.</summary>
    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (_origin is null || !Uri.TryCreate(e.Uri, UriKind.Absolute, out var target))
        {
            return;
        }

        if (!string.Equals(target.GetLeftPart(UriPartial.Authority), _origin.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase))
        {
            e.Cancel = true;
            OpenExternal(target);
        }
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var target))
        {
            OpenExternal(target);
        }
    }

    /// <summary>Интерфейс сообщает выбранную тему: {"type":"theme","theme":"dark"}.</summary>
    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Object
                && root.TryGetProperty("type", out var type) && type.GetString() == "theme"
                && root.TryGetProperty("theme", out var theme))
            {
                ApplyTheme(theme.GetString() == "dark");
            }
        }
        catch (JsonException)
        {
            // Чужие сообщения просто игнорируем.
        }
    }

    private void ApplyTheme(bool dark)
    {
        Background = new SolidColorBrush(dark ? Color.FromRgb(0x0F, 0x14, 0x20) : Color.FromRgb(0xF4, 0xF6, 0xFB));
        SplashTitle.Foreground = new SolidColorBrush(dark ? Color.FromRgb(0xE8, 0xEC, 0xF6) : Color.FromRgb(0x1B, 0x22, 0x33));
        var handle = new WindowInteropHelper(this).Handle;
        if (handle != IntPtr.Zero)
        {
            NativeMethods.SetDarkTitleBar(handle, dark);
        }
    }

    private static bool SystemPrefersDark()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
        return key?.GetValue("AppsUseLightTheme") is int light && light == 0;
    }

    private static void OpenExternal(Uri target)
    {
        if (target.Scheme == Uri.UriSchemeHttp || target.Scheme == Uri.UriSchemeHttps)
        {
            Process.Start(new ProcessStartInfo(target.AbsoluteUri) { UseShellExecute = true })?.Dispose();
        }
    }

    private void OnInstallWebView(object sender, RoutedEventArgs e) => OpenExternal(new Uri(WebViewDownloadUrl));

    private void OnOpenInBrowser(object sender, RoutedEventArgs e)
    {
        if (_origin is not null)
        {
            OpenExternal(_origin);
        }
    }
}
