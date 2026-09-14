// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
// dsh-orb 的窗口层：无边框透明置顶窗 + 拖动 + 右键菜单 + 位置/大小记忆。
//
// 交互：
//   左键单击   把 DSH 窗口切到前台
//   左键拖动   移动球（4px 判定，不动的单击才算点击）
//   右键       菜单（打开 DSH / 演示状态 / 大小 / 置顶 / 回到右上角 / 退出）

using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace DshOrb;

public sealed class OrbWindow : Window
{
    private const double EdgeMargin = 40;   // 别叫 Margin —— 会遮蔽 FrameworkElement.Margin

    // 实测只用得到后三个；32 太小，环挤在一起看不清
    private static readonly double[] Sizes = [44, 56, 72];
    private static readonly string[] SizeNames = ["中", "大", "特大"];

    private readonly OrbVisual _visual = new();
    private readonly MenuItem _demoItem = new();
    private readonly MenuItem _topItem = new();
    private readonly MenuItem[] _sizeItems = new MenuItem[Sizes.Length];

    private Point _downAt;
    private bool _pressed;
    private bool _dragging;
    private int _demoIndex;
    private int _sizeIndex;   // 默认「中」= 44，正好是数组第 0 个

    // 演示用的假数据。接上 Host 插件后，这里换成真实状态即可。
    private static readonly (int run, int ok, int bad, int ask, bool alert, string name)[] Demo =
    [
        (0, 0, 0, 0, false, "空闲"),
        (1, 0, 0, 0, false, "运行中 ×1"),
        (3, 0, 0, 0, false, "运行中 ×3"),
        (2, 3, 0, 0, false, "运行中 + 3 个未读成功"),
        (1, 3, 2, 0, false, "运行中 + 成功 + 失败"),
        (0, 3, 2, 1, false, "待决策（球变黄、脉动）"),
        (2, 3, 1, 0, true,  "AI 中途举手（球变红、脉动）"),
    ];

    public OrbWindow()
    {
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;          // per-pixel alpha
        Background = Brushes.Transparent;
        Topmost = true;
        ShowInTaskbar = false;
        ResizeMode = ResizeMode.NoResize;
        Content = _visual;

        BuildMenu();
        RestoreSettings();

        // 三种启动方式，刻意没有「静默兜底」：
        //   插件拉起    --origin <url> --token <tok>   → 接真实数据
        //   手动调外观  --demo                          → 演示状态（必须显式要求）
        //   什么都没有                                  → 画「无数据」，一眼看得出它没在工作
        // 之前是「没参数就自动进演示」，结果把真正的故障伪装成了正常状态，误导过一次。
        var (origin, token, demo) = ParseArgs();
        if (origin is not null && token is not null)
        {
            _feed = new OrbFeed(_visual, origin, token);
            _feed.Start();
        }
        else if (demo)
        {
            ApplyDemo(0);
        }
        else
        {
            _visual.Disconnected = true;
            RefreshSourceItem();
        }
    }

    private OrbFeed? _feed;

    private static (string? origin, string? token, bool demo) ParseArgs()
    {
        var args = Environment.GetCommandLineArgs();
        string? origin = null, token = null;
        var demo = false;
        for (var i = 0; i < args.Length; i++)
        {
            if (args[i] == "--demo") { demo = true; continue; }
            if (i >= args.Length - 1) continue;
            if (args[i] == "--origin") origin = args[i + 1];
            else if (args[i] == "--token") token = args[i + 1];
        }
        return (origin, token, demo);
    }

    // ---------------------------------------------------------------- 菜单
    // 教训：不要手动给 MenuItem 刷 Background/Foreground。
    // WPF 默认模板里有一列「勾选栏」和分隔条，它们不跟着 ContextMenu 的配色走，
    // 手刷的结果就是左边一列浅色方块 + 白条分隔线。
    // 正确做法是让 WPF 自己切主题（Program.cs 里的 ThemeMode），模板会整套对上。
    private static MenuItem Item(string header) => new() { Header = header };

    private void BuildMenu()
    {
        var menu = new ContextMenu();

        var miOpen = Item("打开 DSH");
        miOpen.Click += (_, _) => OpenDsh();
        menu.Items.Add(miOpen);
        menu.Items.Add(new Separator());

        _demoItem.Click += (_, _) => ApplyDemo(_demoIndex + 1);
        menu.Items.Add(_demoItem);
        // 每次打开菜单刷新一下这一行：接上插件后它显示的是数据源状态，不再是演示
        menu.Opened += (_, _) => RefreshSourceItem();

        var sizeMenu = Item("大小");
        for (var i = 0; i < Sizes.Length; i++)
        {
            var idx = i;
            var mi = Item($"{SizeNames[i]}（{Sizes[i]:0}）");
            mi.IsCheckable = true;
            mi.Click += (_, _) => ApplySize(idx);
            _sizeItems[i] = mi;
            sizeMenu.Items.Add(mi);
        }
        menu.Items.Add(sizeMenu);
        menu.Items.Add(new Separator());

        _topItem.Header = "置顶显示";
        _topItem.IsCheckable = true;
        _topItem.IsChecked = true;
        _topItem.Click += (_, _) => Topmost = _topItem.IsChecked;
        menu.Items.Add(_topItem);

        var miReset = Item("回到右上角");
        miReset.Click += (_, _) =>
        {
            var wa = SystemParameters.WorkArea;
            Left = wa.Right - Width - EdgeMargin;
            Top = wa.Top + 80;
            SaveSettings();
        };
        menu.Items.Add(miReset);
        menu.Items.Add(new Separator());

        var miQuit = Item("退出");
        miQuit.Click += (_, _) => Close();
        menu.Items.Add(miQuit);

        ContextMenu = menu;
    }

    private bool _demoMode;

    private void ApplyDemo(int index)
    {
        if (_feed is not null) return;   // 接了真数据就不让演示覆盖

        _demoMode = true;
        _visual.Disconnected = false;

        _demoIndex = ((index % Demo.Length) + Demo.Length) % Demo.Length;
        var d = Demo[_demoIndex];
        _visual.State.Running = d.run;
        _visual.State.Success = d.ok;
        _visual.State.Failure = d.bad;
        _visual.State.Decision = d.ask;
        _visual.State.Alert = d.alert;
        _visual.StateChanged();
        RefreshSourceItem();
    }

    /// <summary>菜单里那一行，三种情况分得清清楚楚，不互相伪装。</summary>
    private void RefreshSourceItem()
    {
        if (_feed is not null)
        {
            _demoItem.Header = $"数据源：{_feed.Status}";
            _demoItem.IsEnabled = false;
        }
        else if (_demoMode)
        {
            _demoItem.Header = $"演示状态：{Demo[_demoIndex].name}  ▶";
            _demoItem.IsEnabled = true;
        }
        else
        {
            _demoItem.Header = "数据源：无（启动时没传 --origin/--token）";
            _demoItem.IsEnabled = false;
        }
    }

    // ---------------------------------------------------------------- 改大小
    /// <summary>改球的大小，并且保持球的中心不动 —— 否则球会从你放的位置跳走。</summary>
    private void ApplySize(int index)
    {
        _sizeIndex = Math.Clamp(index, 0, Sizes.Length - 1);

        var cx = Left + Width / 2;
        var cy = Top + Height / 2;

        _visual.Size = Sizes[_sizeIndex];
        var w = _visual.RequiredWindowSize;
        Width = w;
        Height = w;

        var wa = SystemParameters.WorkArea;
        Left = Math.Clamp(cx - w / 2, wa.Left, Math.Max(wa.Left, wa.Right - w));
        Top = Math.Clamp(cy - w / 2, wa.Top, Math.Max(wa.Top, wa.Bottom - w));

        for (var i = 0; i < _sizeItems.Length; i++)
            _sizeItems[i].IsChecked = i == _sizeIndex;

        SaveSettings();
    }

    // ---------------------------------------------------------------- 拖动 / 单击
    protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e)
    {
        _downAt = e.GetPosition(this);
        _pressed = true;
        _dragging = false;
        base.OnMouseLeftButtonDown(e);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (_pressed && !_dragging && e.LeftButton == MouseButtonState.Pressed)
        {
            var p = e.GetPosition(this);
            // 4px 判定：不动的算单击，动了的才算拖动
            if (Math.Abs(p.X - _downAt.X) + Math.Abs(p.Y - _downAt.Y) > 4)
            {
                _dragging = true;
                try { DragMove(); } catch { /* 鼠标已经松开 */ }
                _dragging = false;
                _pressed = false;
                SaveSettings();
            }
        }
        base.OnMouseMove(e);
    }

    protected override void OnMouseLeftButtonUp(MouseButtonEventArgs e)
    {
        if (_pressed && !_dragging) OpenDsh();
        _pressed = false;
        _dragging = false;
        base.OnMouseLeftButtonUp(e);
    }

    // ---------------------------------------------------------------- 设置持久化（左、上、大小序号）
    private static string SettingsFile => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "dsh-orb", "settings.txt");

    private void SaveSettings()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsFile)!);
            File.WriteAllText(SettingsFile, string.Create(CultureInfo.InvariantCulture,
                $"{Left:0},{Top:0},{_sizeIndex}"));
        }
        catch { /* 记不住位置不该影响使用 */ }
    }

    private void RestoreSettings()
    {
        var wa = SystemParameters.WorkArea;
        var restored = false;

        try
        {
            if (File.Exists(SettingsFile))
            {
                var parts = File.ReadAllText(SettingsFile).Split(',');
                if (parts.Length >= 2 &&
                    double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var l) &&
                    double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var t))
                {
                    if (parts.Length >= 3 &&
                        int.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out var si))
                        _sizeIndex = Math.Clamp(si, 0, Sizes.Length - 1);

                    _visual.Size = Sizes[_sizeIndex];
                    var w = _visual.RequiredWindowSize;
                    Width = w;
                    Height = w;
                    // 屏幕配置变了的话，别把球丢到看不见的地方
                    Left = Math.Clamp(l, wa.Left, Math.Max(wa.Left, wa.Right - w));
                    Top = Math.Clamp(t, wa.Top, Math.Max(wa.Top, wa.Bottom - w));
                    restored = true;
                }
            }
        }
        catch { /* 读不到就用默认 */ }

        if (!restored)
        {
            _visual.Size = Sizes[_sizeIndex];
            var w = _visual.RequiredWindowSize;
            Width = w;
            Height = w;
            Left = wa.Right - w - EdgeMargin;
            Top = wa.Top + 80;
        }

        for (var i = 0; i < _sizeItems.Length; i++)
            _sizeItems[i].IsChecked = i == _sizeIndex;
    }

    // ---------------------------------------------------------------- 打开 DSH
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    private const int SW_RESTORE = 9;

    private static void OpenDsh()
    {
        try
        {
            foreach (var p in Process.GetProcessesByName("msedge"))
            {
                if (p.MainWindowTitle.Contains("DeepSeek Harness", StringComparison.OrdinalIgnoreCase))
                {
                    if (p.MainWindowHandle != IntPtr.Zero)
                    {
                        ShowWindow(p.MainWindowHandle, SW_RESTORE);   // 最小化了就先还原
                        SetForegroundWindow(p.MainWindowHandle);
                    }
                    return;
                }
            }
        }
        catch { /* 找不到就算了，不该弹错 */ }
    }
}
