/**
 * VariableInfo.java
 *
 * 代表一个局部变量的信息。
 */
package com.example.webideabackend.model.debug;

public record VariableInfo(
        String name,
        String type,
        String value
) {}