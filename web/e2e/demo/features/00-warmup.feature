# Two warmup scenarios that exist only to absorb Playwright's
# 0-byte-first-test video bug. The reporter detects them by their
# "00-" filename prefix and discards their recorded videos.
#
# In single-worker runs with slowMo + video:on, the FIRST one or two
# test slots reliably emit a 0-byte webm. Two warmups is the floor;
# one is sometimes not enough.

Feature: Warmup

  Scenario: Warmup A
    Given I am on the Halberd playground

  Scenario: Warmup B
    Given I am on the Halberd playground

  Scenario: Warmup C
    Given I am on the Halberd playground
