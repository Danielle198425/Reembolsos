import sys
import os

try:
    from database import SessionLocal
    from models import JobRole

    db = SessionLocal()
    default_roles = ['Administrador', 'Usuário', 'Aprovador', 'Financeiro']

    for role_name in default_roles:
        existing = db.query(JobRole).filter(JobRole.name == role_name).first()
        if not existing:
            new_role = JobRole(name=role_name, active=True)
            db.add(new_role)

    db.commit()
    db.close()
    print('Roles seeded successfully.')
except Exception as e:
    print('Error:', str(e))
