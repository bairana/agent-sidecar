// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
// dsh-orb 的状态模型。现在数据是假的（还没接 DSH），
// 但字段和将来 Host 插件要喂的东西一一对应。

namespace DshOrb;

public sealed class OrbState
{
    /// <summary>正在跑任务的会话数 —— 中间那个大数字。</summary>
    public int Running { get; set; }

    /// <summary>未读成功数。</summary>
    public int Success { get; set; }

    /// <summary>失败数。</summary>
    public int Failure { get; set; }

    /// <summary>待决策数（模型提问等你回答）。</summary>
    public int Decision { get; set; }

    /// <summary>AI 中途举手：turn 还在跑，但模型判断走错方向了。</summary>
    public bool Alert { get; set; }

    /// <summary>要你动手的状态。优先级：待决策 &gt; 中途举手（球体变色用）。</summary>
    public string? ActionKind =>
        Decision > 0 ? "decision" : Alert ? "alert" : null;

    /// <summary>需不需要继续跑动画。静止时应该完全停掉重绘，CPU 归零。</summary>
    public bool NeedsAnimation => Running > 0 || ActionKind is not null;

    public void CopyFrom(OrbState o)
    {
        Running = o.Running;
        Success = o.Success;
        Failure = o.Failure;
        Decision = o.Decision;
        Alert = o.Alert;
    }
}
