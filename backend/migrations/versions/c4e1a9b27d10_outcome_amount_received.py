"""outcome amount_received

Revision ID: c4e1a9b27d10
Revises: 7824896673dc
Create Date: 2026-11-08 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c4e1a9b27d10'
down_revision: Union[str, Sequence[str], None] = '7824896673dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('outcome', sa.Column('amount_received', sa.Numeric(precision=14, scale=2), nullable=True))
    op.create_check_constraint('ck_outcome_amount', 'outcome', 'amount_received is null or amount_received > 0')


def downgrade() -> None:
    op.drop_constraint('ck_outcome_amount', 'outcome', type_='check')
    op.drop_column('outcome', 'amount_received')
