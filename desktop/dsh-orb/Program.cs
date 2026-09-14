// 本文件由 AI 生成（DeepSeek Harness 里的 agent 编写），人负责需求与验收。
using System.Windows;

namespace DshOrb;

public static class Program
{
    [STAThread]
    public static void Main()
    {
        // 注意：不要给菜单刷自定义配色。
        // WPF 默认模板里有一列「勾选栏」和分隔条，它们不跟 ContextMenu 的配色走，
        // 手刷的结果就是左边一列浅色方块 + 白条分隔线。
        // 交给 WPF 用系统主题画，菜单才正常。
        //
        // （Application.ThemeMode 是 .NET 9+ 的新 API，但被标记为实验性，
        //   启用会触发编译错误 WPF0001。当前系统是浅色主题，默认菜单已经正确，
        //   所以不引它；将来要跟随深色模式再说。）
        var app = new Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
        app.Run(new OrbWindow());
    }
}
