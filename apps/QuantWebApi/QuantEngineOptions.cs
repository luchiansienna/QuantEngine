namespace QuantWebApi;

public sealed class QuantEngineOptions
{
    public const string SectionName = "QuantEngine";

    public string ExecutablePath { get; set; } = "QuantCli";
    public int TimeoutSeconds { get; set; } = 10;
}
