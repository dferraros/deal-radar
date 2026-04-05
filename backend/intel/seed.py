"""Seed the intel_ontology_nodes table with 30 canonical primitives."""
import uuid
from datetime import datetime

SEED_PRIMITIVES = [
    ("Transformer architectures", "primitive", "Attention-based neural network architecture"),
    ("Diffusion models", "primitive", "Generative models using iterative denoising"),
    ("RLHF / preference optimization", "primitive", "Reinforcement learning from human feedback"),
    ("Retrieval augmented generation", "primitive", "Combining retrieval systems with generative models"),
    ("Vector databases", "primitive", "Databases optimized for high-dimensional vector similarity search"),
    ("Tool calling / function calling", "primitive", "LLM capability to invoke external tools"),
    ("Agent orchestration", "primitive", "Multi-step AI agent coordination and task planning"),
    ("Long-context reasoning", "primitive", "Processing and reasoning over very long input sequences"),
    ("Multimodal encoders", "primitive", "Models that encode multiple modalities (text, image, audio)"),
    ("Vision-language models", "primitive", "Models understanding both images and text"),
    ("Computer vision (CNN-based)", "primitive", "Convolutional neural network visual processing"),
    ("Foundation model fine-tuning", "primitive", "Adapting pre-trained foundation models to specific tasks"),
    ("SLAM", "primitive", "Simultaneous localization and mapping for robotics navigation"),
    ("Sensor fusion", "primitive", "Combining data from multiple sensor types for richer perception"),
    ("Motion planning", "primitive", "Computing paths and trajectories for autonomous agents"),
    ("Robotic manipulation", "primitive", "Controlling robot arms and end-effectors to interact with objects"),
    ("Reinforcement learning policies", "primitive", "Learning behavior through reward signal optimization"),
    ("Imitation learning", "primitive", "Learning from expert demonstrations"),
    ("Sim-to-real transfer", "primitive", "Training in simulation then deploying to real environments"),
    ("Edge inference", "primitive", "Running AI models on edge devices with constrained compute"),
    ("GPU inference optimization", "primitive", "Maximizing throughput/latency of model inference on GPUs"),
    ("Synthetic data generation", "primitive", "Creating artificial training data at scale"),
    ("Data labeling pipelines", "primitive", "Human-in-the-loop systems for annotating training data"),
    ("Model evaluation frameworks", "primitive", "Systematic benchmarking and evaluation of AI models"),
    ("Experiment automation", "primitive", "Automated design and execution of scientific experiments"),
    ("High-throughput biological screening", "primitive", "Automated large-scale biological assays"),
    ("Protein structure prediction", "primitive", "Computational prediction of 3D protein folding"),
    ("Fleet routing", "primitive", "Optimizing routes for multiple autonomous agents or vehicles"),
    ("Real-time operating systems", "primitive", "OS designed for deterministic real-time task execution"),
    ("Autonomy stack", "primitive", "Full software stack enabling autonomous operation"),
]

SEED_ALIASES = {
    "Retrieval augmented generation": ["RAG", "retrieval pipeline", "retrieval augmented", "retrieval-augmented generation"],
    "SLAM": ["visual SLAM", "visual localization", "mapping stack", "simultaneous localization"],
    "Reinforcement learning policies": ["RL control", "policy learning", "RL policies"],
    "Tool calling / function calling": ["tool use", "function calling", "tool calling"],
    "Transformer architectures": ["transformer", "attention mechanism", "self-attention"],
    "Diffusion models": ["diffusion", "score-based models", "DDPM"],
    "Robotic manipulation": ["manipulation", "grasping", "end-effector control"],
    "Edge inference": ["edge AI", "on-device inference", "embedded inference"],
    "Agent orchestration": ["agentic workflows", "multi-agent", "agent framework"],
    "Imitation learning": ["behavior cloning", "learning from demonstration", "LfD"],
}


async def seed_ontology(db) -> int:
    """Insert seed primitives if not already present. Returns count inserted."""
    from sqlalchemy import select
    from backend.models import IntelOntologyNode, IntelOntologyAlias

    inserted = 0
    for name, node_type, description in SEED_PRIMITIVES:
        result = await db.execute(
            select(IntelOntologyNode).where(IntelOntologyNode.canonical_name == name)
        )
        existing = result.scalars().first()
        if existing:
            continue

        node = IntelOntologyNode(
            id=uuid.uuid4(),
            canonical_name=name,
            node_type=node_type,
            description=description,
            status="active",
            created_at=datetime.utcnow(),
        )
        db.add(node)
        await db.flush()

        for alias in SEED_ALIASES.get(name, []):
            db.add(IntelOntologyAlias(
                id=uuid.uuid4(),
                node_id=node.id,
                alias=alias,
                alias_type="manual",
            ))
        inserted += 1

    await db.commit()
    return inserted
