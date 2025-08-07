/**
 * VariableInfo.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于表示调试器暂停时，当前作用域内一个局部变量的信息。
 * 它包含了变量的名称、类型和值的字符串表示，用于在前端UI的变量窗口中展示。
 */
package club.ppmc.idea.model.debug;

/**
 * 代表一个局部变量信息的记录。
 *
 * @param name 变量的名称。
 * @param type 变量的类型（例如, "int", "java.lang.String"）。
 * @param value 变量当前值的字符串表示。
 */
public record VariableInfo(String name, String type, String value) {}