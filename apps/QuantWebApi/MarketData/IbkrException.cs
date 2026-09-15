namespace QuantWebApi.MarketData;

public sealed class IbkrException : Exception
{
    public IbkrException(string message)
        : base(message)
    {
    }

    public IbkrException(
        string message,
        Exception innerException)
        : base(message, innerException)
    {
    }
}