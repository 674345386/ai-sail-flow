export const researchDemoPrograms = [
  `root = Col([heading, mode, result])
$mode = "精简"
heading = Title("把研究结果整理成一份界面", "md")
mode = SegmentedControl($mode, ["精简", "展开"], true)
result = Card([Text($mode == "精简" ? "呈现核心发现与下一步。" : "增加证据、限制与后续问题。", "sm"), Badge("可继续调整", "info")], "soft")`,
  `root = Col([heading, mode, finding, next])
$mode = "精简"
heading = Title("研究记录已更新", "md")
mode = SegmentedControl($mode, ["精简", "展开"], true)
finding = Card([Title("核心发现", "sm"), Text("同一套界面组件，可以连接不同的模型与执行基座。", "sm"), Badge("新增发现", "success")])
next = Card([Text($mode == "精简" ? "下一步：验证会话恢复与状态保留。" : "下一步：对比不同 Harness 的会话恢复、工具事件与跨版本表单状态，记录一致性边界。", "sm")], "soft")`,
];
