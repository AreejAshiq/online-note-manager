from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime


db = SQLAlchemy()

# User model (database table)
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    
    # User aur Note ke beech relationship
    notes = db.relationship('Note', backref='author', lazy='dynamic') 

    def __repr__(self):
        return f'<User {self.username}>'

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# Note Model
class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(250), nullable=False)
    content = db.Column(db.Text, nullable=False)
    
    # Enhanced fields
    category = db.Column(db.String(50), default='Miscellaneous')
    is_pinned = db.Column(db.Boolean, default=False)
    reminder_date = db.Column(db.DateTime, nullable=True) 
    
    # Foreign Key
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) 
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(db.DateTime, default=db.func.now(), onupdate=db.func.now())
    
    def __repr__(self):
        return f'<Note {self.title}>'

    def to_dict(self):
        # JSON-friendly dictionary for API responses
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'category': self.category,
            'is_pinned': self.is_pinned,
            # Dates ko ISO format mein bhej rahe hain taaki JS unko easily handle kar sake
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'reminder_date': self.reminder_date.isoformat() if self.reminder_date else None
        }