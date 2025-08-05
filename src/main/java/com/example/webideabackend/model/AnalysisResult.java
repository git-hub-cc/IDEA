package com.example.webideabackend.model;

import java.util.List;

/**
 * 封装后端代码分析结果的DTO。
 *
 * @param classNames 成功解析出的完全限定类名列表。
 * @param errors     解析过程中发现的语法错误列表。
 */
public record AnalysisResult(
        List<String> classNames,
        List<CompilationResult> errors
) {}