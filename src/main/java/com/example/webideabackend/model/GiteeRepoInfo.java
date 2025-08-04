package com.example.webideabackend.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * DTO for representing a Gitee repository's basic information.
 * It's designed to be sent to the frontend for selection.
 *
 * @param name The name of the repository.
 * @param description A short description of the repository.
 * @param cloneUrl The HTTPS URL used for cloning the repository.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record GiteeRepoInfo(
        String name,
        String description,
        String cloneUrl
) {}