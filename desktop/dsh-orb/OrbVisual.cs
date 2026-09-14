// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
// dsh-orb 的绘制层。
//
// 视觉规则：
//   外圈  运行中    蓝色旋转弧
//   内圈  结果      成功从 12 点右侧顺时针长，失败从 12 点左侧逆时针长，各占半圈为上限
//   球体  要你动手  不是只描个边框 —— 底色染上状态色 + 亮边框 + 外面再套一圈光晕环，
//                   三样叠起来才够「明显」。尺寸可以由右键菜单改，所以几何全部按 Size 推导。
//   中间  运行数
// 没有内容的圈根本不画 —— 这条是从手表上抄的，也是它看起来安静的原因。

using System.Globalization;
using System.Windows;
using System.Windows.Media;

namespace DshOrb;

public sealed class OrbVisual : FrameworkElement
{
    // ---------- 基准尺寸：球直径 44 时的一整套参数 ----------
    private const double BaseSize = 44.0;
    private const double BaseStroke = 2.2;
    private const double BaseFont = 11.0;
    private const double Gap = 0.105;        // 12 点两侧各退开的角度，防止线帽相撞
    private const double Tau = Math.PI * 2;
    private const double Top = -Math.PI / 2;
    private const double Knock = 1.10;       // 「敲一下」最大放大倍数

    private static readonly Color ColRun = Color.FromRgb(59, 130, 246);
    private static readonly Color ColOk = Color.FromRgb(52, 199, 89);
    private static readonly Color ColBad = Color.FromRgb(255, 69, 58);
    private static readonly Color ColAsk = Color.FromRgb(245, 194, 66);
    private static readonly Color ColShell = Color.FromRgb(11, 12, 14);

    private static readonly Typeface NumFont = new(
        new FontFamily("Segoe UI Variable Display, Segoe UI, Microsoft YaHei UI"),
        FontStyles.Normal, FontWeights.Bold, FontStretches.Normal);

    private readonly OrbState _state = new();
    private double _spin = Top;
    private TimeSpan _last;
    private double _now;
    private double _knockAt = double.NegativeInfinity;
    private string? _lastAction;

    private double _size = BaseSize;

    public OrbState State => _state;

    private bool _disconnected;

    /// <summary>
    /// 没有数据源（既没接插件、也没显式要求演示）。
    /// 这时画一个明确「无数据」的样子，而不是显示一个看起来正常的空状态 ——
    /// 静默兜底会把真正的故障伪装成「一切正常」。
    /// </summary>
    public bool Disconnected
    {
        get => _disconnected;
        set
        {
            if (_disconnected == value) return;
            _disconnected = value;
            InvalidateVisual();
        }
    }

    /// <summary>球直径。右键菜单可以改，几何全部跟着重算。</summary>
    public double Size
    {
        get => _size;
        set
        {
            _size = Math.Clamp(value, 28, 96);
            InvalidateVisual();
        }
    }

    // ---------- 由 Size 推导的几何 ----------
    private double Scale => _size / BaseSize;
    private double BallR => _size / 2;
    private double RingR => BallR - 2.5 * Scale;
    private double ResultR => BallR - 7.0 * Scale;
    private double StrokeW => BaseStroke * Scale;
    private double HaloR => BallR + 2.5 * Scale;     // 外面那圈光晕环
    private double HaloW => 2.2 * Scale;

    /// <summary>这个尺寸下，窗口需要多大才装得下（含敲击放大和光晕环）。</summary>
    public double RequiredWindowSize =>
        Math.Ceiling((HaloR + HaloW / 2) * Knock * 2) + 4;

    /// <summary>状态变了：重画，并按需开关动画。</summary>
    public bool StateChanged()
    {
        var act = _state.ActionKind;
        var knock = false;
        if (act is not null && act != _lastAction)
        {
            _knockAt = _now;
            knock = true;
        }
        _lastAction = act;
        Sync();
        InvalidateVisual();
        return knock;
    }

    // ---------- 动画开关：静止时彻底停掉，CPU 归零 ----------
    private bool _hooked;

    private void Sync()
    {
        if (_state.NeedsAnimation && !_hooked)
        {
            _last = default;
            CompositionTarget.Rendering += OnFrame;
            _hooked = true;
        }
        else if (!_state.NeedsAnimation && _hooked)
        {
            CompositionTarget.Rendering -= OnFrame;
            _hooked = false;
        }
    }

    private void OnFrame(object? sender, EventArgs e)
    {
        if (e is RenderingEventArgs r)
        {
            if (_last == default) _last = r.RenderingTime;
            var dt = (r.RenderingTime - _last).TotalSeconds;
            _last = r.RenderingTime;
            if (dt > 0.05) dt = 0.05;
            _now = r.RenderingTime.TotalMilliseconds;
            if (_state.Running > 0) _spin += dt * 2.1;
        }
        InvalidateVisual();
    }

    protected override void OnRender(DrawingContext dc)
    {
        var cx = ActualWidth / 2;
        var cy = ActualHeight / 2;

        var knockAge = _now - _knockAt;
        var scale = knockAge >= 0 && knockAge < 600
            ? 1.0 + (Knock - 1.0) * Math.Exp(-knockAge / 150.0) * Math.Cos(knockAge / 45.0)
            : 1.0;

        dc.PushTransform(new ScaleTransform(scale, scale, cx, cy));
        var c = new Point(cx, cy);

        var act = _state.ActionKind;
        var statusColor = _disconnected ? null : act switch
        {
            "alert" => ColBad,
            "decision" => ColAsk,
            _ => (Color?)null,
        };
        var breathe = 0.5 + 0.5 * Math.Sin(_now / 260.0);

        // ---- 外面那圈光晕：要你动手时才出现，让球在余光里也抓得住 ----
        if (statusColor is { } halo)
        {
            dc.DrawEllipse(null,
                new Pen(new SolidColorBrush(Alpha(halo, 0.22 + 0.50 * breathe)), HaloW),
                c, HaloR, HaloR);
        }

        // ---- 球体：底色只轻轻染一点 ----
        // 曾经染到 0.32，黄色确实最抢眼，但内圈的绿弧红弧会被压闷。
        // 现在把亮度都让给边框和光晕环，底色只留 0.15 做「整体氛围」。
        var fill = statusColor is { } sc ? Mix(ColShell, sc, 0.15) : ColShell;
        dc.DrawEllipse(new SolidColorBrush(fill), null, c, BallR, BallR);

        // ---- 边框：亮度的主要承担者 ----
        var (border, borderAlpha, borderW) = statusColor is { } bc
            ? (bc, 0.85 + 0.15 * breathe, 2.4 * Scale)
            : (Colors.White, 0.18, 1.2 * Scale);
        dc.DrawEllipse(null,
            new Pen(new SolidColorBrush(Alpha(border, borderAlpha)), borderW),
            c, BallR - borderW / 2, BallR - borderW / 2);

        // ---- 无数据源：什么圈都不画，只留一个安静的球和一个破折号 ----
        // 这样一眼就能看出「它没在工作」，而不是把故障伪装成一个正常的空闲态。
        if (_disconnected)
        {
            DrawCenterText(dc, c, "–");
            dc.Pop();
            return;
        }

        // ---- 外圈：运行中 ----
        if (_state.Running > 0)
            DrawArc(dc, c, RingR, _spin, Tau * 0.40, ColRun, StrokeW, 1.0);

        // ---- 内圈：结果（成功顺时针 / 失败逆时针） ----
        if (_state.Success > 0)
            DrawArc(dc, c, ResultR, Top + Gap, Tau * ResFrac(_state.Success), ColOk, StrokeW, 1.0);
        if (_state.Failure > 0)
            DrawArc(dc, c, ResultR, Top - Gap, -Tau * ResFrac(_state.Failure), ColBad, StrokeW, 1.0);

        // ---- 要你动手：一圈从边缘向内收的 ping ----
        if (statusColor is { } pc)
        {
            var t = (_now % 1500) / 1500.0;
            var pr = RingR - t * 5 * Scale;
            if (pr > ResultR + StrokeW / 2 + 1.2 * Scale)
                DrawArc(dc, c, pr, Top + Gap, Math.PI * 1.15, pc, 1.6 * Scale, 0.55 * (1 - t) * (1 - t));
        }

        // ---- 中间的运行数 ----
        DrawCenterText(dc, c, _state.Running.ToString(CultureInfo.InvariantCulture));

        dc.Pop();
    }

    private void DrawCenterText(DrawingContext dc, Point c, string text)
    {
        var ft = new FormattedText(
            text,
            CultureInfo.InvariantCulture,
            FlowDirection.LeftToRight,
            NumFont,
            BaseFont * Scale,
            new SolidColorBrush(Color.FromRgb(242, 243, 245)),
            VisualTreeHelper.GetDpi(this).PixelsPerDip);
        dc.DrawText(ft, new Point(c.X - ft.Width / 2, c.Y - ft.Height / 2 + 0.5));
    }

    /// <summary>结果弧长：两边各占半圈为上限，所以成功和失败永远不会叠在一起。</summary>
    private static double ResFrac(int n) => Math.Min(0.5, 0.05 + 0.15 * n);

    private static Color Mix(Color a, Color b, double t) => Color.FromRgb(
        (byte)(a.R + (b.R - a.R) * t),
        (byte)(a.G + (b.G - a.G) * t),
        (byte)(a.B + (b.B - a.B) * t));

    private static Color Alpha(Color c, double a) =>
        Color.FromArgb((byte)Math.Clamp(a * 255, 0, 255), c.R, c.G, c.B);

    private static void DrawArc(DrawingContext dc, Point c, double r,
        double a0, double span, Color col, double width, double alpha)
    {
        const int n = 56;
        var geo = new StreamGeometry();
        using (var ctx = geo.Open())
        {
            for (var i = 0; i <= n; i++)
            {
                var a = a0 + span * i / n;
                var p = new Point(c.X + r * Math.Cos(a), c.Y + r * Math.Sin(a));
                if (i == 0) ctx.BeginFigure(p, false, false);
                else ctx.LineTo(p, true, false);
            }
        }
        geo.Freeze();

        var pen = new Pen(new SolidColorBrush(Alpha(col, alpha)), width)
        {
            StartLineCap = PenLineCap.Round,
            EndLineCap = PenLineCap.Round,
            LineJoin = PenLineJoin.Round,
        };
        pen.Freeze();
        dc.DrawGeometry(null, pen, geo);
    }
}
