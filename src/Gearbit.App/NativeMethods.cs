using System.Runtime.InteropServices;

namespace Gearbit.App;

internal static class NativeMethods
{
    // DWMWA_USE_IMMERSIVE_DARK_MODE: 20 в Windows 10 20H1+ и Windows 11, 19 — в ранних сборках Windows 10.
    private const int DarkModeAttribute = 20;
    private const int DarkModeAttributeLegacy = 19;

    /// <summary>Тёмный заголовок окна для ночной темы (на старых системах вызов просто ничего не делает).</summary>
    public static void SetDarkTitleBar(IntPtr hwnd, bool dark)
    {
        var value = dark ? 1 : 0;
        if (DwmSetWindowAttribute(hwnd, DarkModeAttribute, ref value, sizeof(int)) != 0)
        {
            _ = DwmSetWindowAttribute(hwnd, DarkModeAttributeLegacy, ref value, sizeof(int));
        }
    }

    [DllImport("dwmapi.dll", PreserveSig = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}
