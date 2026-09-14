// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
// 从 DSH 的 Host 插件取状态。
//
// 球是被插件用 ctx.subprocess 起起来的，端口和令牌由插件通过命令行参数传进来，
// 所以球不需要做任何发现机制。
//
// 断线处理：连续失败 5 次就把状态清零并标记未连接。
// 不这么做的话，DSH 挂了以后球会永远停在「运行中 2」这种假状态上。

using System.Net.Http;
using System.Text.Json;
using System.Windows.Threading;

namespace DshOrb;

public sealed class OrbFeed
{
    private const int FailLimit = 5;

    private readonly OrbVisual _visual;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly string _url;

    private int _fails;

    public bool Connected { get; private set; }
    public string Status { get; private set; } = "连接中…";

    public OrbFeed(OrbVisual visual, string origin, string token)
    {
        _visual = visual;
        _url = $"{origin.TrimEnd('/')}/dsh-orb/status?token={Uri.EscapeDataString(token)}";
        _timer.Tick += OnTick;
    }

    public void Start()
    {
        _timer.Start();
        _ = PollAsync();      // 立刻来一发，别等第一个 tick
    }

    private void OnTick(object? sender, EventArgs e)
    {
        _timer.Stop();        // 防止上一发没回来就叠加
        _ = PollAsync();
    }

    private async Task PollAsync()
    {
        try
        {
            var json = await _http.GetStringAsync(_url).ConfigureAwait(true);
            Apply(json);
            _fails = 0;
            if (!Connected)
            {
                Connected = true;
                Status = "已连接 DSH";
            }
        }
        catch
        {
            _fails++;
            if (_fails >= FailLimit && Connected || _fails >= FailLimit)
            {
                if (Connected || _fails == FailLimit)
                {
                    Connected = false;
                    Status = "已断开（DSH 没在跑？）";
                    Zero();
                }
            }
        }
        finally
        {
            _timer.Start();
        }
    }

    private void Apply(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var st = _visual.State;

        st.Running = GetInt(root, "running");
        st.Success = GetInt(root, "success");
        st.Failure = GetInt(root, "failure");
        st.Decision = GetInt(root, "decision");
        st.Alert = root.TryGetProperty("alert", out var a) && a.ValueKind == JsonValueKind.True;

        _visual.StateChanged();
    }

    private static int GetInt(JsonElement root, string name) =>
        root.TryGetProperty(name, out var v) && v.TryGetInt32(out var n) ? n : 0;

    private void Zero()
    {
        var st = _visual.State;
        st.Running = 0;
        st.Success = 0;
        st.Failure = 0;
        st.Decision = 0;
        st.Alert = false;
        _visual.StateChanged();
    }
}
