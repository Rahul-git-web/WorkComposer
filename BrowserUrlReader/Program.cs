using System.Text.Json;

class Program
{
    static void Main()
    {
        Console.WriteLine("Switch to Arc now...");
        Console.WriteLine("Reading active window in 5 seconds...");

        Thread.Sleep(5000);

        var reader = new BrowserReader();

        BrowserInfo? browser = reader.GetActiveBrowser();

        if (browser == null)
        {
            Console.WriteLine("{}");
            return;
        }

        Console.WriteLine(
            JsonSerializer.Serialize(
                browser,
                new JsonSerializerOptions
                {
                    WriteIndented = true
                }
            )
        );
    }
}