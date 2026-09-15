using System.Globalization;

namespace QuantWebApi.MarketData;

public sealed record IbkrOptionSnapshotRequest(
    string Symbol,
    string Expiry,
    double Strike,
    string OptionType,
    string Exchange = "SMART",
    string Currency = "USD")
{
    public string NormalizedSymbol =>
        Symbol.Trim().ToUpperInvariant();

    public string NormalizedExchange =>
        Exchange.Trim().ToUpperInvariant();

    public string NormalizedCurrency =>
        Currency.Trim().ToUpperInvariant();

    public string NormalizedOptionRight =>
        OptionType.Equals(
            "Call",
            StringComparison.OrdinalIgnoreCase)
                ? "C"
                : "P";

    public Dictionary<string, string[]>? Validate()
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(Symbol) ||
            Symbol.Length > 15 ||
            !Symbol.All(character =>
                char.IsLetterOrDigit(character) ||
                character is '.' or '-'))
        {
            errors[nameof(Symbol)] =
            [
                "Symbol may contain only letters, numbers, '.' or '-'."
            ];
        }

        if (!DateTime.TryParseExact(
                Expiry,
                "yyyyMMdd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var expiryDate))
        {
            errors[nameof(Expiry)] =
            [
                "Expiry must use yyyyMMdd format, for example 20261016."
            ];
        }
        else if (expiryDate.Date < DateTime.UtcNow.Date)
        {
            errors[nameof(Expiry)] =
            [
                "Expiry cannot be in the past."
            ];
        }

        if (!double.IsFinite(Strike) ||
            Strike <= 0 ||
            Strike > 1_000_000)
        {
            errors[nameof(Strike)] =
            [
                "Strike must be a positive finite number."
            ];
        }

        if (!OptionType.Equals(
                "Call",
                StringComparison.OrdinalIgnoreCase) &&
            !OptionType.Equals(
                "Put",
                StringComparison.OrdinalIgnoreCase))
        {
            errors[nameof(OptionType)] =
            [
                "OptionType must be Call or Put."
            ];
        }

        if (string.IsNullOrWhiteSpace(Exchange))
        {
            errors[nameof(Exchange)] =
            [
                "Exchange is required."
            ];
        }

        if (string.IsNullOrWhiteSpace(Currency))
        {
            errors[nameof(Currency)] =
            [
                "Currency is required."
            ];
        }

        return errors.Count == 0
            ? null
            : errors;
    }
}