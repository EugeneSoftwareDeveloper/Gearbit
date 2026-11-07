namespace Gearbit.Client;

/// <summary>Хаб отказал или связи нет. Текст — на языке программы (<c>GEARBIT_LANG</c>), его можно показать ребёнку.</summary>
public class GearbitException : Exception
{
    public GearbitException()
    {
    }

    public GearbitException(string message)
        : base(message)
    {
    }

    public GearbitException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public GearbitException(string message, int? code)
        : base(message)
    {
        Code = code;
    }

    /// <summary>Код ошибки JSON-RPC от хаба, если ошибку вернул хаб.</summary>
    public int? Code { get; }
}

/// <summary>
/// Программу остановили: СТОП, страж, потеря связи с роботом.
/// Если программа поймала его в <c>catch</c>, следующая команда робота бросит его снова.
/// </summary>
public sealed class ProgramStoppedException : GearbitException
{
    public ProgramStoppedException()
        : base(ClientText.Current.Stopped)
    {
    }

    public ProgramStoppedException(string message)
        : base(message)
    {
    }

    public ProgramStoppedException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
