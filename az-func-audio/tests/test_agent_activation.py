from agent.activation import should_use_template_agent_workflow


def test_structured_review_explicitly_enables_agent_workflow():
    assert should_use_template_agent_workflow(
        {"analysis_workflow": "structured_review"}
    )


def test_reasoning_levels_do_not_select_the_workflow():
    for metadata in (
        {},
        {"analysis_reasoning": "high"},
        {"analysis_reasoning": "xhigh"},
        {"provider_parameters": {"reasoning_effort": "max"}},
        {"enable_reasoning": True},
        {"analysis_workflow": "standard"},
    ):
        assert should_use_template_agent_workflow(metadata) is False
