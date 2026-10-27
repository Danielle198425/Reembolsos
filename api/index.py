import os
import sys

# Adiciona a raiz do projeto ao sys.path para imports funcionarem no ambiente serverless
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app import app
