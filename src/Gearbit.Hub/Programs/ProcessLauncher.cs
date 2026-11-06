using System.ComponentModel;
using System.Diagnostics;
using System.Text;

namespace Gearbit.Hub.Programs;

/// <summary>Настоящие процессы: без окна, вывод построчно, ввод сразу закрыт (input() получит EOF).</summary>
public sealed class ProcessLauncher : IProgramLauncher
{
    private static readonly Encoding Utf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

    public IProgramProcess Start(ProgramCommand command, string workingDirectory, Action<ProgramStream, string> onLine)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(onLine);

        var info = new ProcessStartInfo(command.FileName)
        {
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Utf8,
            StandardErrorEncoding = Utf8,
        };
        foreach (var argument in command.Arguments)
        {
            info.ArgumentList.Add(argument);
        }

        foreach (var (name, value) in command.Environment)
        {
            info.Environment[name] = value;
        }

        var process = new Process { StartInfo = info };
        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is not null)
            {
                onLine(ProgramStream.Out, e.Data);
            }
        };
        process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null)
            {
                onLine(ProgramStream.Err, e.Data);
            }
        };

        try
        {
            process.Start();
        }
        catch
        {
            process.Dispose();
            throw;
        }

        process.StandardInput.Close();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return new Running(process);
    }

    private sealed class Running : IProgramProcess
    {
        private readonly Process _process;
        private int _exited;

        public Running(Process process)
        {
            _process = process;
            Completion = WaitAsync();
        }

        public Task<int> Completion { get; }

        public void Kill()
        {
            if (Volatile.Read(ref _exited) != 0)
            {
                return;
            }

            try
            {
                _process.Kill(entireProcessTree: true);
            }
            catch (InvalidOperationException)
            {
                // уже закончился
            }
            catch (Win32Exception)
            {
                // процесс заканчивается прямо сейчас
            }
        }

        private async Task<int> WaitAsync()
        {
            // WaitForExitAsync дожидается и конца перенаправленного вывода.
            await _process.WaitForExitAsync().ConfigureAwait(false);
            var code = _process.ExitCode;
            Volatile.Write(ref _exited, 1);
            _process.Dispose();
            return code;
        }
    }
}
