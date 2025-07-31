package com.example.webideabackend.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GiteeRepoInfo(
        String name,
        String description,
        @JsonProperty("ssh_url") String sshUrl
) {}