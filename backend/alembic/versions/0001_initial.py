from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String()),
        sa.Column("created_at", sa.DateTime()),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String()),
        sa.Column("mode", sa.String()),
        sa.Column("status", sa.String()),
        sa.Column("started_at", sa.DateTime()),
        sa.Column("stopped_at", sa.DateTime()),
        sa.Column("profit", sa.Float()),
        sa.Column("trades", sa.Integer()),
    )
    op.create_table(
        "trades",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String()),
        sa.Column("session_id", sa.String()),
        sa.Column("pair", sa.String()),
        sa.Column("direction", sa.String()),
        sa.Column("amount", sa.Float()),
        sa.Column("expiry", sa.Integer()),
        sa.Column("order_id", sa.String()),
        sa.Column("status", sa.String()),
        sa.Column("result", sa.String()),
        sa.Column("pnl", sa.Float()),
        sa.Column("created_at", sa.DateTime()),
    )
    op.create_table(
        "iq_credentials",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("username", sa.String()),
        sa.Column("password_enc", sa.String()),
        sa.Column("updated_at", sa.DateTime()),
    )

def downgrade():
    op.drop_table("iq_credentials")
    op.drop_table("trades")
    op.drop_table("sessions")
    op.drop_table("users")
